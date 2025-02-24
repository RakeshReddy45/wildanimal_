# WildSense-AI
## Comprehensive User Manual

### Table of Contents
1. Introduction
2. System Architecture
3. Installation & Setup
4. Features & Functionalities
5. User Guide
6. Alert System
7. Troubleshooting
8. Security Considerations
9. Support

### 1. Introduction
WildSense-AI is a comprehensive wildlife detection system that combines real-time detection capabilities with advanced AI features for animal identification. The system supports multiple input methods and provides instant alerts through Telegram integration.

### 2. System Architecture

#### 2.1 Directory Structure
```
WildSense-AI/
├── index.html
├── FrontEnd/
│   ├── styles/
│   │   └── styles.css
│   └── scripts/
│       └── script.js
└── BackEnd/
    ├── app.py
    ├── uploads/
    ├── processed/
    └── logs/
        └── log.log
```

#### 2.2 Technology Stack
- Backend: Python Flask
- Frontend: HTML, CSS, JavaScript
- AI Models: YOLO, Google Gemini AI
- Alert System: Telegram Bot
- Database: MySQL
- Video Processing: OpenCV

### 3. Installation & Setup

#### 3.1 Prerequisites
- Python 3.8+
- Web browser (Chrome/Firefox/Safari)
- IP Webcam app (for RTSP functionality)
- Stable internet connection
- MySQL database

#### 3.2 Configuration
1. API Keys Setup:
   ```python
   TELEGRAM_BOT_TOKEN = "your_token"
   TELEGRAM_CHAT_ID = "your_chat_id"
   GEMINI_API_KEY = "your_gemini_api_key"
   ```

2. Database Configuration:
   - Configure MySQL connection parameters
   - Ensure proper permissions are set

#### 3.3 Initial Setup
1. Clone the repository
2. Install dependencies using `requirements.txt`
3. Configure API keys
4. Start the Flask server
5. Access the web interface

### 4. Features & Functionalities

#### 4.1 Video Upload Detection
- Supported formats: MP4, AVI, MOV
- Maximum file size: 100MB
- Processing status indicator
- Results saved in processed/ directory

#### 4.2 Live Webcam Detection
- Real-time detection through browser
- Camera selection option
- Adjustable detection sensitivity
- Frame rate control options

#### 4.3 RTSP Stream Detection
- Compatible with IP Webcam app
- Connection setup:
  1. Install IP Webcam app
  2. Connect devices to same network
  3. Enter RTSP URL in system
  4. Start detection

#### 4.4 Gemini AI Animal Identifier
- Two modes of operation:
  1. Image upload
  2. Camera capture
- Provides detailed species information:
  - Species name
  - Habitat
  - Behavior patterns
  - Conservation status

#### 4.5 Alert System
- Real-time Telegram notifications
- Customizable alert triggers
- Image/video clip attachments
- Timestamp and location data

### 5. User Guide

#### 5.1 Starting the System
1. Navigate to system URL
2. Choose detection mode
3. Configure settings if needed
4. Start detection

#### 5.2 Video Upload
1. Click "Upload Video"
2. Select video file
3. Set detection parameters
4. Monitor processing progress
5. View results in dashboard

#### 5.3 Live Webcam Detection
1. Click "Start Webcam"
2. Grant camera permissions
3. Adjust camera position
4. Monitor real-time detections
5. Save or export results

#### 5.4 RTSP Setup
1. Open IP Webcam app
2. Start server in app
3. Copy RTSP URL
4. Paste URL in WildSense-AI
5. Begin detection

#### 5.5 Using Gemini AI Identifier
1. Choose input method:
   - Upload image
   - Take photo
2. Wait for processing
3. View detailed analysis
4. Save or share results

### 6. Alert System

#### 6.1 Telegram Integration
- Configure bot token
- Set chat ID
- Customize alert triggers
- Test notification system

#### 6.2 Alert Types
- Animal detection
- New species identified
- System status
- Error notifications

### 7. Troubleshooting

#### 7.1 Common Issues
- Video upload failures
- Camera connection issues
- RTSP stream errors
- AI processing delays

#### 7.2 Error Logging
- Check logs/ directory
- Review log.log file
- Error codes and meanings
- Resolution steps

### 8. Security Considerations
- API key protection
- Data encryption
- Access control
- Privacy settings
- Data retention policy

### 9. Support
- System maintenance
- Bug reporting
- Feature requests
- Contact information

### Best Practices
1. Regular system updates
2. Backup important data
3. Monitor system resources
4. Test alert system regularly
5. Keep API keys secure

### Performance Optimization
1. Adjust video quality as needed
2. Monitor network bandwidth
3. Clear processed files regularly
4. Optimize database queries
5. Regular cache clearing