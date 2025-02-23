import logging
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np
from ultralytics import YOLO
import queue
import threading
import uuid
import time
import os
from datetime import datetime
import json
import requests
import base64
from PIL import Image
import io
import google.generativeai as genai
from typing import Dict, Optional, Tuple
import os
import asyncio
import mysql.connector

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.DEBUG)

@app.before_request
def log_request_info():
    app.logger.debug('Headers: %s', request.headers)
    app.logger.debug('Method: %s', request.method)
    app.logger.debug('URL: %s', request.url)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    return response

# Database Connection
db_config = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "video_processing"
}


def get_db_connection():
    return mysql.connector.connect(**db_config)

# Configuration
UPLOAD_FOLDER = "uploads"
PROCESSED_FOLDER = "processed"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# Load YOLO model
model = YOLO("model/model_yolov11l_epoch_90_100.pt")

#Model for Live detection stream through camera
LiveDetectionModel = YOLO("model/yolov8m.pt")

# Store active processing sessions
active_sessions = {}

# Telegram Bot Config
TELEGRAM_BOT_TOKEN = ""
TELEGRAM_CHAT_ID = ""  # User to receive video


class VideoProcessor:
    def __init__(self, video_path):
        self.video_path = video_path
        self.output_path = os.path.join(PROCESSED_FOLDER, f"processed_{os.path.basename(video_path)}")
        self.clip_path = os.path.join(PROCESSED_FOLDER, f"clip_{uuid.uuid4()}.mp4")
        self.detection_queue = queue.Queue()
        self.is_running = False
        self.progress = 0
        self.session_id = str(uuid.uuid4())

        # Track species detections with confidence
        self.species_detections = {}  # {species: [(confidence, frame_number)]}
        self.total_frames = 0

    def start(self):
        self.is_running = True
        threading.Thread(target=self._process_video).start()
        return self.session_id

    def _process_video(self):
        cap = cv2.VideoCapture(self.video_path)
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        clip_writer = cv2.VideoWriter(self.clip_path, fourcc, fps, (width, height))

        frame_count = 0
        detection_frames = []

        while self.is_running and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            results = model.predict(frame, conf=0.5)
            detected = False
            detections = []

            for box in results[0].boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = model.names[cls]

                # Track detection with confidence and frame number
                if label not in self.species_detections:
                    self.species_detections[label] = []
                self.species_detections[label].append((conf, frame_count))

                detected = True
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (52, 152, 219), 2)
                cv2.putText(frame, f"{label} {conf:.2f}", (int(x1), int(y1) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (52, 152, 219), 2)

                detections.append({
                    'label': label,
                    'confidence': conf,
                    'box': [int(x1), int(y1), int(x2), int(y2)]
                })

            if detected:
                detection_frames.append((frame, detections))

            # Keep only the most recent 12 seconds of detections
            if len(detection_frames) > fps * 12:
                detection_frames.pop(0)

            frame_count += 1
            self.progress = int((frame_count / self.total_frames) * 100)
            self.detection_queue.put({
                'progress': self.progress,
                'detections': detections
            })

            time.sleep(0.01)

        # Save the clip with the most consistent detections
        self._save_best_detection_clip(detection_frames, clip_writer)

        cap.release()
        clip_writer.release()
        self.is_running = False

        # Get top species and send to Telegram
        top_species = self._get_top_species()
        self._send_to_telegram(top_species)

        # Update MySQL with processed video path and detected classes
        self._update_db_with_processed_video()

        self.detection_queue.put({
            'status': 'completed',
            'clip_url': f'/processed/{os.path.basename(self.clip_path)}',
            'top_species': top_species,
            'progress': 100
        })

    def _save_best_detection_clip(self, detection_frames, clip_writer):
        """Save the clip with the most consistent and confident detections."""
        if not detection_frames:
            return

        for frame, _ in detection_frames:
            clip_writer.write(frame)

    def _update_db_with_processed_video(self):
        try:
            connection = get_db_connection()
            cursor = connection.cursor()
            detected_classes_str = ", ".join(self._get_top_species())

            query = """
                UPDATE video_details 
                SET processed_video_path = %s, status = 'completed', detected_classes = %s
                WHERE session_id = %s
            """
            cursor.execute(query, (self.output_path, detected_classes_str, self.session_id))
            connection.commit()
            cursor.close()
            connection.close()
        except mysql.connector.Error as err:
            print(f"MySQL Error: {err}")

    def _get_top_species(self):
        """Get the most confidently detected species while handling edge cases."""
        species_scores = {}

        # Count detections for each species
        species_counts = {species: len(detections) for species, detections in self.species_detections.items()}

        # Calculate scores based on confidence and frequency
        for species, detections in self.species_detections.items():
            avg_conf = sum(conf for conf, _ in detections) / len(detections)
            frequency = len(detections) / self.total_frames
            species_scores[species] = avg_conf * frequency

        # Sort species by score in descending order
        sorted_species = sorted(species_scores.items(), key=lambda x: x[1], reverse=True)

        # Handling edge cases
        if not sorted_species:
            return []

        max_count = max(species_counts.values())  # Find max occurrences of any species

        # Apply filtering for misclassified detections
        threshold = max(1, max_count // 4)  # Only keep species detected at least 1/4th of max detections
        filtered_species = [species for species, _ in sorted_species if species_counts[species] >= threshold]

        # Case: If multiple species appear exactly once, return all
        if len(filtered_species) == 0:
            return list(species_counts.keys())

        # Return top 3 species or all if there are only a few species
        return filtered_species[:3] if len(filtered_species) > 3 else filtered_species

    def _send_to_telegram(self, top_species):
        """Send the detection clip to Telegram with species information."""
        try:
            with open(self.clip_path, 'rb') as video_file:
                species_text = ', '.join(top_species) if top_species else 'No clear detections'
                url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVideo"
                data = {
                    "chat_id": TELEGRAM_CHAT_ID,
                    "caption": f"Top detected species: {species_text}"
                }
                response = requests.post(url, data=data, files={"video": video_file})
                if not response.ok:
                    print(f"Telegram API error: {response.text}")
        except Exception as e:
            print(f"Error sending to Telegram: {str(e)}")


@app.route('/process-video', methods=['POST'])
def process_video():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = f"{uuid.uuid4()}.mp4"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    processor = VideoProcessor(filepath)
    session_id = processor.start()
    active_sessions[session_id] = processor

    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        query = "INSERT INTO video_details (session_id, original_video_path, created_at) VALUES (%s, %s, %s)"
        cursor.execute(query, (session_id, filepath, created_at))
        connection.commit()
        cursor.close()
        connection.close()
    except mysql.connector.Error as err:
        print(f"MySQL Error: {err}")


    return jsonify({'session_id': session_id, 'message': 'Processing started'})


@app.route('/detection-stream/<session_id>')
def detection_stream(session_id):
    def generate():
        if session_id not in active_sessions:
            return

        processor = active_sessions[session_id]
        while processor.is_running or not processor.detection_queue.empty():
            try:
                data = processor.detection_queue.get(timeout=1)
                yield f"data: {json.dumps(data)}\n\n"
                if data.get('status') == 'completed':
                    break
            except queue.Empty:
                continue

        if session_id in active_sessions:
            del active_sessions[session_id]

    return Response(generate(), mimetype='text/event-stream')


@app.route('/processed/<filename>')
def processed_video(filename):
    return send_from_directory(PROCESSED_FOLDER, filename)


@app.route('/video-details/<session_id>', methods=['GET'])
def get_video_details(session_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        query = "SELECT * FROM video_details WHERE session_id = %s"
        cursor.execute(query, (session_id,))
        result = cursor.fetchone()
        cursor.close()
        connection.close()

        if result:
            return jsonify(result)
        else:
            return jsonify({'error': 'Session not found'}), 404
    except mysql.connector.Error as err:
        return jsonify({'error': f"MySQL Error: {err}"}), 500

def process_frame(frame, model):
    """Process a single frame with YOLO model and return detections"""
    results = model.predict(frame, conf=0.5)[0]
    detections = []

    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        cls = int(box.cls[0])
        label = model.names[cls]

        # Draw bounding box
        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (52, 152, 219), 2)
        cv2.putText(frame, f"{label} {conf:.2f}", (int(x1), int(y1) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (52, 152, 219), 2)

        detections.append({
            'label': label,
            'confidence': conf,
            'box': [int(x1), int(y1), int(x2), int(y2)]
        })

    return frame, detections


@app.route('/camera-stream', methods=['POST'])
def camera_stream():
    frame_data = request.json.get('frame')
    if not frame_data:
        return jsonify({'error': 'No frame data provided'}), 400

    # Decode base64 frame
    try:
        frame_bytes = base64.b64decode(frame_data.split(',')[1])
        frame_arr = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame = cv2.imdecode(frame_arr, cv2.IMREAD_COLOR)

        # Process frame with YOLO
        processed_frame, detections = process_frame(frame, LiveDetectionModel)

        # Encode processed frame back to base64
        _, buffer = cv2.imencode('.jpg', processed_frame)
        processed_frame_b64 = base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            'processed_frame': f'data:image/jpeg;base64,{processed_frame_b64}',
            'detections': detections
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500



# Replace with your actual API key
GEMINI_API_KEY = ""
genai.configure(api_key=GEMINI_API_KEY)

class WildlifeIdentificationService:
    def __init__(self):
        """Initialize the service with Gemini API"""
        self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')

    def process_base64_image(self, base64_string):
        """Process base64 image string to PIL Image and numpy array"""
        try:
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]

            image_data = base64.b64decode(base64_string)
            image = Image.open(io.BytesIO(image_data))

            if image.mode != 'RGB':
                image = image.convert('RGB')

            return image
        except Exception as e:
            print(f"Image processing error: {str(e)}")
            return None

    async def identify_with_gemini(self, image):
        """Identify and get information about wildlife using Gemini"""
        try:
            prompt = """
            Analyze this image and identify the animal(s) present. Provide:
            1. The specific species name
            2. A confidence level (high/medium/low)
            3. Three interesting facts about this species
            Response format: 
            {
                "species": "species_name",
                "confidence_level": "high/medium/low",
                "facts": ["fact1", "fact2", "fact3"]
            }
            """

            response = self.gemini_model.generate_content([prompt, image])
            response_text = response.candidates[0].content.parts[0].text

            print(f"Raw Gemini API response: {response_text}")

            # Clean and parse the response text
            clean_text = response_text.strip().replace("```json", "").replace("```", "")
            parsed_result = json.loads(clean_text)

            confidence_map = {"high": 0.9, "medium": 0.7, "low": 0.5}
            return {
                "species": parsed_result.get("species", "Unknown"),
                "confidence": confidence_map.get(parsed_result.get("confidence_level", "").lower(), 0.5),
                "information": "\n".join(parsed_result.get("facts", [])),
                "source": "gemini"
            }
        except Exception as e:
            print(f"Gemini API error: {str(e)}")
            return self.get_fallback_response()

    def get_fallback_response(self):
        """Provide fallback response when identification fails"""
        return {
            "species": "Unknown",
            "confidence": 0,
            "information": "Unable to identify the animal. Please try with a clearer photo.",
            "source": "fallback"
        }

    async def identify_wildlife(self, image_data):
        """Main identification method using only Gemini"""
        pil_image = self.process_base64_image(image_data)
        if pil_image is None:
            return {"error": "Invalid image data"}, 400

        # Use Gemini for species identification
        gemini_result = await self.identify_with_gemini(pil_image)
        return gemini_result, 200

    def identify_wildlife_sync(self, image_data):
        """Synchronous wrapper for Flask"""
        return asyncio.run(self.identify_wildlife(image_data))


# Initialize the service
wildlife_service = WildlifeIdentificationService()

@app.route('/api/identify-wildlife', methods=['POST', 'OPTIONS'])
def identify_wildlife():
    """Endpoint for wildlife identification"""
    print("Reached this route")
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        data = request.json
        image_data = data.get('image')

        if not image_data:
            return jsonify({"error": "No image provided"}), 400

        response, status_code = wildlife_service.identify_wildlife_sync(image_data)
        return jsonify(response), status_code

    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/say-hello', methods=['GET'])
def say_hello():
    return "hello"


if __name__ == '__main__':
    app.run(debug=True, port=5000)
