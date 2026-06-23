const SERVER_URL = window.ENV.SERVER_URL;

let faceLandmarker;
let runningMode = "VIDEO";
let webcam = document.getElementById("webcam");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");
let scanBtn = document.getElementById("scan-btn");
let statusText = document.getElementById("status-text");
let statusOverlay = document.getElementById("status-overlay");
let instructionText = document.getElementById("instruction-text");

let isScanning = false;
let eyesClosed = false;
let lastVideoTime = -1;

let currentLat = 0.0;
let currentLon = 0.0;

async function fetchLocation() {
    try {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    currentLat = position.coords.latitude;
                    currentLon = position.coords.longitude;
                    console.log("Kiosk location fetched via GPS:", currentLat, currentLon);
                },
                async (error) => {
                    console.warn("Geolocation denied or failed. Falling back to IP-based location...", error);
                    await fetchIpLocation();
                },
                { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocation is not supported by this browser. Falling back to IP-based location...");
            await fetchIpLocation();
        }
    } catch (err) {
        console.error("Location fetch failed:", err);
    }
}

async function fetchIpLocation() {
    try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (data.latitude && data.longitude) {
            currentLat = data.latitude;
            currentLon = data.longitude;
            console.log("Kiosk location fetched via IP:", currentLat, currentLon);
        }
    } catch (e) {
        console.error("IP fallback failed:", e);
    }
}

fetchLocation();

// Initialize MediaPipe Face Landmarker
async function initVision() {
    const { FaceLandmarker, FilesetResolver } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js"
    );
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: runningMode,
        numFaces: 1
    });
    console.log("MediaPipe initialized");
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcam.srcObject = stream;
        webcam.addEventListener("loadeddata", () => {
            canvas.width = webcam.videoWidth;
            canvas.height = webcam.videoHeight;
        });
    } catch (err) {
        alert("Camera access denied or unavailable.");
    }
}

initVision();
startCamera();

scanBtn.addEventListener("click", () => {
    if (currentLat === 0.0 && currentLon === 0.0) {
        alert("Still acquiring GPS location. Please ensure location permissions are granted and try again in a few seconds.");
        return;
    }
    if (!faceLandmarker) {
        alert("AI Model is still loading. Please wait.");
        return;
    }
    isScanning = true;
    eyesClosed = false;
    scanBtn.disabled = true;
    statusOverlay.classList.remove("hidden");
    statusText.innerText = "Please look at the camera and BLINK";
    statusText.style.color = "white";
    predictWebcam();
});

function calculateEAR(landmarks, indices) {
    const p1 = landmarks[indices[0]];
    const p2 = landmarks[indices[1]];
    const p3 = landmarks[indices[2]];
    const p4 = landmarks[indices[3]];
    const p5 = landmarks[indices[4]];
    const p6 = landmarks[indices[5]];
    
    const v26 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
    const v35 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
    const v14 = Math.hypot(p1.x - p4.x, p1.y - p4.y);
    
    return (v26 + v35) / (2.0 * v14);
}

async function predictWebcam() {
    if (!isScanning) return;

    let startTimeMs = performance.now();
    if (lastVideoTime !== webcam.currentTime) {
        lastVideoTime = webcam.currentTime;
        const results = faceLandmarker.detectForVideo(webcam, startTimeMs);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            
            // Draw a simple bounding box equivalent by finding min/max
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (let lm of landmarks) {
                if (lm.x < minX) minX = lm.x;
                if (lm.y < minY) minY = lm.y;
                if (lm.x > maxX) maxX = lm.x;
                if (lm.y > maxY) maxY = lm.y;
            }
            
            ctx.strokeStyle = "#f59e0b"; // Warning color
            ctx.lineWidth = 3;
            ctx.strokeRect(minX * canvas.width, minY * canvas.height, (maxX-minX)*canvas.width, (maxY-minY)*canvas.height);

            // Left Eye: 33, 160, 158, 133, 153, 144
            // Right Eye: 362, 385, 387, 263, 373, 380
            const leftEAR = calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
            const rightEAR = calculateEAR(landmarks, [362, 385, 387, 263, 373, 380]);
            const avgEAR = (leftEAR + rightEAR) / 2.0;

            const BLINK_THRESHOLD = 0.2;
            
            if (avgEAR < BLINK_THRESHOLD) {
                eyesClosed = true;
            } else if (eyesClosed && avgEAR > BLINK_THRESHOLD) {
                // Blink completed
                isScanning = false;
                statusText.innerText = "Blink detected! Verifying...";
                statusText.style.color = "#3b82f6";
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                sendToServer();
                return;
            }
        }
    }
    
    requestAnimationFrame(predictWebcam);
}

function sendToServer() {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = webcam.videoWidth;
    tempCanvas.height = webcam.videoHeight;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(webcam, 0, 0);
    
    tempCanvas.toBlob((blob) => {
        const formData = new FormData();
        formData.append("file", blob, "capture.jpg");
        formData.append("lat", currentLat);
        formData.append("lon", currentLon);
        
        fetch(`${SERVER_URL}/verify_attendance`, {
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" },
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                displayResult(`${data.action} successful for ${data.user}`, "success");
            } else if (data.status === "ignored") {
                displayResult(data.message, "warning");
            } else {
                displayResult(data.message, "danger");
            }
        })
        .catch(err => {
            displayResult("Server Connection Failed", "danger");
        });
    }, "image/jpeg", 0.9);
}

function displayResult(message, type) {
    statusText.innerText = message;
    statusText.style.color = type === "success" ? "#10b981" : (type === "warning" ? "#f59e0b" : "#ef4444");
    
    setTimeout(() => {
        statusOverlay.classList.add("hidden");
        scanBtn.disabled = false;
        instructionText.innerText = "Press SCAN to mark attendance.";
    }, 4000);
}
