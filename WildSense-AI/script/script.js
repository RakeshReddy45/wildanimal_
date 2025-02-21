// Initialize Feather Icons
feather.replace();

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const previewContainer = document.getElementById('previewContainer');
const originalVideo = document.getElementById('originalVideo');
const processedVideo = document.getElementById('processedVideo');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const modeBtns = document.querySelectorAll('.mode-btn');
const modeContents = document.querySelectorAll('.mode-content');
const rtspUrlInput = document.getElementById('rtspUrl');
const connectRtspBtn = document.getElementById('connectRtsp');
const prevTestimonialBtn = document.getElementById('prevTestimonial');
const nextTestimonialBtn = document.getElementById('nextTestimonial');


// Initialize global variables
let cameraVisualizer = null;
let cameraStream = null;

// DOM Elements
const cameraFeed = document.getElementById('cameraFeed');
const detectionCanvas = document.getElementById('detectionCanvas');
const startCameraBtn = document.getElementById('startCamera');
const captureSnapshotBtn = document.getElementById('captureSnapshot');

// Video Processor Class
class VideoProcessor {
    constructor(apiUrl = 'http://localhost:5000') {
        this.apiUrl = apiUrl;
        this.isProcessing = false;
    }

    async processVideo(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            
            const response = await fetch(`${this.apiUrl}/process-video`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Video processing failed');
            return await response.json();
        } catch (error) {
            console.error('Error processing video:', error);
            throw error;
        }
    }

    startDetectionStream(sessionId) {
        const eventSource = new EventSource(`${this.apiUrl}/detection-stream/${sessionId}`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.progress) {
                progressBar.style.width = `${data.progress}%`;
                progressText.textContent = `${data.progress}%`;
            }

            if (data.detections) this.updateDetectionInfo(data.detections);
            if (data.status === 'completed') {
                eventSource.close();
                this.onProcessingComplete(data.video_url);
            }
        };

        eventSource.onerror = (error) => {
            console.error('Detection stream error:', error);
            eventSource.close();
        };
    }

    updateDetectionInfo(detections) {
        const detectionInfo = document.getElementById('detectionInfo');
        let html = `
            <div class="detection-results">
                <h4>Detection Results</h4>
                <ul>`;
        
        detections.forEach(detection => {
            html += `
                <li>${detection.label} detected 
                    (Confidence: ${(detection.confidence * 100).toFixed(1)}%)
                </li>`;
        });

        html += `</ul></div>`;
        detectionInfo.innerHTML = html;
    }

    onProcessingComplete(videoUrl) {
        setTimeout(() => {
            processedVideo.src = videoUrl;
            processedVideo.style.display = 'block';
        }, 3000);
    }
}

// File Upload Handling
async function handleVideoUpload(file) {
    previewContainer.style.display = 'block';
    dropZone.style.display = 'none';
    originalVideo.src = URL.createObjectURL(file);
    
    try {
        const processor = new VideoProcessor();
        const result = await processor.processVideo(file);
        if (result.session_id) processor.startDetectionStream(result.session_id);
    } catch (error) {
        console.error('Error during video processing:', error);
        alert('Error processing video. Please try again.');
    }
}

// Mode Switching
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        modeContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${mode}-mode`).classList.add('active');
    });
});

// Drag and Drop Handling
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) handleVideoUpload(file);
});

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => e.target.files[0] && handleVideoUpload(e.target.files[0]));

// Camera and Detection Visualization
class DetectionVisualizer {
    constructor(cameraFeed, canvas) {
        this.cameraFeed = cameraFeed;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isRunning = false;
        this.processedImageElement = document.createElement('img');
        this.processedImageElement.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.processedImageElement, 0, 0, this.canvas.width, this.canvas.height);
        };
    }

    async start() {
        this.isRunning = true;
        this.processFrames();
    }

    stop() {
        this.isRunning = false;
    }

    async processFrames() {
        while (this.isRunning) {
            try {
                // Create temporary canvas to capture current frame
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.cameraFeed.videoWidth;
                tempCanvas.height = this.cameraFeed.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(this.cameraFeed, 0, 0);

                // Convert frame to base64
                const frameData = tempCanvas.toDataURL('image/jpeg');

                // Send frame to backend for processing
                const response = await fetch('http://localhost:5000/camera-stream', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ frame: frameData })
                });

                if (!response.ok) throw new Error('Frame processing failed');

                const data = await response.json();
                
                // Update canvas with processed frame
                this.processedImageElement.src = data.processed_frame;
                
                // Update detection info if needed
                this.updateDetectionInfo(data.detections);

                // Small delay to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                console.error('Frame processing error:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    updateDetectionInfo(detections) {
        const detectionInfo = document.getElementById('detectionInfo');
        if (!detectionInfo) {
            // Create detection info element if it doesn't exist
            const container = document.createElement('div');
            container.id = 'detectionInfo';
            document.querySelector('.camera-container').appendChild(container);
        }
        
        let html = `
            <div class="detection-results">
                <h4>Live Detections</h4>
                <ul>`;
        
        detections.forEach(detection => {
            html += `
                <li>${detection.label} detected 
                    (Confidence: ${(detection.confidence * 100).toFixed(1)}%)
                </li>`;
        });

        html += `</ul></div>`;
        detectionInfo.innerHTML = html;
    }
}

// Camera control functions
async function startCamera() {
    try {
        if (!cameraStream) {
            // Start camera
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            cameraStream = stream;
            cameraFeed.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise(resolve => cameraFeed.onloadedmetadata = resolve);
            cameraFeed.play();

            // Set canvas dimensions to match video feed
            detectionCanvas.width = cameraFeed.videoWidth;
            detectionCanvas.height = cameraFeed.videoHeight;

            // Initialize and start visualizer
            cameraVisualizer = new DetectionVisualizer(cameraFeed, detectionCanvas);
            await cameraVisualizer.start();

            // Update button text
            startCameraBtn.innerHTML = '<i data-feather="video-off"></i> Stop Camera';
            feather.replace(); // Refresh Feather icons
            
            // Show capture button
            captureSnapshotBtn.style.display = 'inline-block';
        } else {
            // Stop camera
            stopCamera();
        }
    } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera. Please check permissions.');
    }
}

function stopCamera() {
    if (cameraStream) {
        // Stop all tracks
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        
        // Clear video source
        cameraFeed.srcObject = null;
        
        // Stop visualizer
        if (cameraVisualizer) {
            cameraVisualizer.stop();
            cameraVisualizer = null;
        }

        // Reset button text
        startCameraBtn.innerHTML = '<i data-feather="video"></i> Start Camera';
        feather.replace(); // Refresh Feather icons
        
        // Hide capture button
        captureSnapshotBtn.style.display = 'none';

        window.location.reload();
    }
}

// Event listeners
startCameraBtn.addEventListener('click', startCamera);

// Snapshot capture functionality
captureSnapshotBtn.addEventListener('click', () => {
    if (cameraStream) {
        const canvas = document.createElement('canvas');
        canvas.width = cameraFeed.videoWidth;
        canvas.height = cameraFeed.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cameraFeed, 0, 0);
        
        // You can handle the captured image here
        // For example, download it:
        const link = document.createElement('a');
        link.download = 'capture.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopCamera();
});

// RTSP Handler
class RTSPHandler {
    constructor() {
        this.isConnected = false;
    }

    connect(url) {
        this.isConnected = true;
        document.getElementById('rtspStream').src = '/api/placeholder/640/480';
        this.showStatus('Connected to RTSP stream');
    }

    disconnect() {
        this.isConnected = false;
        document.getElementById('rtspStream').src = '';
        this.showStatus('Disconnected from RTSP stream');
    }

    showStatus(message) {
        const statusElement = document.createElement('div');
        statusElement.className = 'rtsp-status';
        statusElement.textContent = message;
        document.querySelector('.rtsp-container').appendChild(statusElement);
    }
}

const rtspHandler = new RTSPHandler();
connectRtspBtn.addEventListener('click', () => {
    const rtspUrl = rtspUrlInput.value;
    if (!rtspUrl) return alert('Please enter RTSP URL');
    
    if (!rtspHandler.isConnected) {
        rtspHandler.connect(rtspUrl);
        connectRtspBtn.textContent = 'Disconnect';
    } else {
        rtspHandler.disconnect();
        connectRtspBtn.textContent = 'Connect Stream';
    }
});

// Testimonials Slider
let currentTestimonial = 0;
const testimonialTrack = document.querySelector('.testimonial-track');
const testimonials = document.querySelectorAll('.testimonial-card');

function updateTestimonialSlider() {
    testimonialTrack.style.transform = `translateX(-${currentTestimonial * 100}%)`;
}

prevTestimonialBtn.addEventListener('click', () => {
    if (currentTestimonial > 0) {
        currentTestimonial--;
        updateTestimonialSlider();
    }
});

nextTestimonialBtn.addEventListener('click', () => {
    if (currentTestimonial < testimonials.length - 1) {
        currentTestimonial++;
        updateTestimonialSlider();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.mode-btn').click();
    setInterval(() => {
        currentTestimonial = currentTestimonial < testimonials.length - 1 ? currentTestimonial + 1 : 0;
        updateTestimonialSlider();
    }, 5000);
});

// Progressively enhance with Intersection Observer
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                animateCounter(counter);
                observer.unobserve(counter);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.counter').forEach(counter => observer.observe(counter));
}

function animateCounter(counter) {
    const target = +counter.getAttribute('data-target');
    const duration = 2000;
    let start = null;

    const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const percentage = Math.min(progress / duration, 1);
        counter.textContent = Math.floor(percentage * target);
        if (percentage < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}


// Wildlife Assistant Frontend JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const wildlifeAssistant = {
        elements: {
            modal: document.querySelector('.wildlife-assistant-modal'),
            openBtn: document.querySelector('.wildlife-assistant-btn'),
            closeBtn: document.querySelector('.wildlife-assistant-close'),
            cameraBtn: document.querySelector('.wildlife-assistant-option.camera'),
            uploadBtn: document.querySelector('.wildlife-assistant-option.upload'),
            fileInput: document.getElementById('wildlife-file-input'),
            camera: document.getElementById('wildlife-camera'),
            canvas: document.getElementById('wildlife-canvas'),
            preview: document.getElementById('wildlife-image-preview'),
            result: document.querySelector('.wildlife-assistant-result'),
            details: document.getElementById('wildlife-details'),
            newCaptureBtn: document.querySelector('.wildlife-new-capture'),
            options: document.querySelector('.wildlife-assistant-options')
        },
        stream: null,
        capturedImage: null,

        init() {
            this.bindEvents();
        },

        bindEvents() {
            this.elements.openBtn.addEventListener('click', () => this.openModal());
            this.elements.closeBtn.addEventListener('click', () => this.closeModal());
            this.elements.cameraBtn.addEventListener('click', () => this.startCamera());
            this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
            this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            this.elements.newCaptureBtn.addEventListener('click', () => this.resetInterface());
            
            // Close modal when clicking outside
            window.addEventListener('click', (e) => {
                if (e.target === this.elements.modal) {
                    this.closeModal();
                }
            });
        },

        async startCamera() {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
                
                this.elements.camera.srcObject = this.stream;
                this.elements.camera.style.display = 'block';
                this.elements.preview.style.display = 'none';
                this.elements.result.style.display = 'none';
                
                // Add capture button
                const captureBtn = document.createElement('button');
                captureBtn.className = 'btn primary capture-btn';
                captureBtn.innerHTML = 'Capture';
                captureBtn.addEventListener('click', () => this.captureImage());
                
                this.elements.options.innerHTML = '';
                this.elements.options.appendChild(captureBtn);
            } catch (error) {
                console.error('Error accessing camera:', error);
                alert('Unable to access camera. Please check permissions or try uploading an image instead.');
            }
        },

        captureImage() {
            const context = this.elements.canvas.getContext('2d');
            this.elements.canvas.width = this.elements.camera.videoWidth;
            this.elements.canvas.height = this.elements.camera.videoHeight;
            context.drawImage(this.elements.camera, 0, 0);
            
            this.capturedImage = this.elements.canvas.toDataURL('image/jpeg');
            this.displayPreview(this.capturedImage);
            this.stopCamera();
            
            // Show submit and retake buttons
            this.elements.options.innerHTML = `
                <button class="btn primary submit-btn">Submit</button>
                <button class="btn secondary retake-btn">Retake</button>
            `;
            
            document.querySelector('.submit-btn').addEventListener('click', () => this.submitImage());
            document.querySelector('.retake-btn').addEventListener('click', () => this.startCamera());
        },

        stopCamera() {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.elements.camera.style.display = 'none';
            }
        },

        handleFileUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.capturedImage = e.target.result;
                    this.displayPreview(this.capturedImage);
                    
                    // Show submit button
                    this.elements.options.innerHTML = `
                        <button class="btn primary submit-btn">Submit</button>
                        <button class="btn secondary cancel-btn">Cancel</button>
                    `;
                    
                    document.querySelector('.submit-btn').addEventListener('click', () => this.submitImage());
                    document.querySelector('.cancel-btn').addEventListener('click', () => this.resetInterface());
                };
                reader.readAsDataURL(file);
            }
        },

        displayPreview(imageData) {
            this.elements.preview.style.display = 'block';
            this.elements.preview.innerHTML = `<img src="${imageData}" alt="Preview">`;
        },

        async submitImage() {
            try {
                console.log('Submitting image...');
                const response = await fetch('http://127.0.0.1:5000/api/identify-wildlife', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        image: this.capturedImage
                    })
                });
        
                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);
        
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Server response:', errorText);
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
        
                const data = await response.json();
                this.showResults(data);
            } catch (error) {
                console.error('Detailed error:', error);
                alert(`Error processing image: ${error.message}`);
            }
        },

        showResults(data) {
            this.elements.preview.style.display = 'block';
            this.elements.result.style.display = 'block';
            this.elements.options.style.display = 'none';
            
            // Display results with a close button
            this.elements.details.innerHTML = `
                <div class="results-header">
                    <button class="close-results-btn">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="wildlife-result-item">
                    <h5>Species:</h5>
                    <p>${data.species}</p>
                </div>
                <div class="wildlife-result-item">
                    <h5>Confidence:</h5>
                    <p>${(data.confidence * 100).toFixed(2)}%</p>
                </div>
                <div class="wildlife-result-item">
                    <h5>Information:</h5>
                    <p>${data.information}</p>
                </div>
            `;
        
            // Add scrollable styling to the result container
            this.elements.result.style.maxHeight = '60vh';
            this.elements.result.style.overflowY = 'auto';
            
            // Initialize Feather icons for the close button
            feather.replace();
        
            // Add click handler for close button
            document.querySelector('.close-results-btn').addEventListener('click', () => {
                this.resetInterface();
            });
        },

        resetInterface() {
            this.elements.camera.style.display = 'none';
            this.elements.preview.style.display = 'none';
            this.elements.result.style.display = 'none';
            this.elements.options.style.display = 'flex';
            this.capturedImage = null;
            this.elements.fileInput.value = '';
            
            // Reset options to initial state
            this.elements.options.innerHTML = `
                <button class="wildlife-assistant-option camera">
                    <i data-feather="camera"></i>
                    Take Photo
                </button>
                <button class="wildlife-assistant-option upload">
                    <i data-feather="upload"></i>
                    Upload Photo
                </button>
            `;
            
            // Rebind events
            this.elements.cameraBtn = document.querySelector('.wildlife-assistant-option.camera');
            this.elements.uploadBtn = document.querySelector('.wildlife-assistant-option.upload');
            this.elements.cameraBtn.addEventListener('click', () => this.startCamera());
            this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
            
            // Refresh Feather icons
            feather.replace();
        },

        openModal() {
            this.elements.modal.style.display = 'block';
            this.resetInterface();
        },

        closeModal() {
            this.elements.modal.style.display = 'none';
            this.stopCamera();
            this.resetInterface();
        }
    };

    wildlifeAssistant.init();
});


const counters = document.querySelectorAll('.stat-number');

counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-target'));
    const duration = 1000; // Animation duration in milliseconds
    const step = target / (duration / 16); // Update every 16ms (60fps)
    
    let current = 0;
    const updateCounter = () => {
        current += step;
        if (current < target) {
            counter.textContent = Math.round(current);
            requestAnimationFrame(updateCounter);
        } else {
            counter.textContent = target;
        }
    };
    
    updateCounter();
});