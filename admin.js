const SERVER_URL = window.ENV.SERVER_URL;

// Elements
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const kioskLink = document.getElementById("kiosk-link");

// State
let currentLat = 0.0;
let currentLon = 0.0;
let adminToken = "";

// Auth Logic
async function fetchLocation() {
    try {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    document.getElementById("login-lat").value = position.coords.latitude;
                    document.getElementById("login-lon").value = position.coords.longitude;
                    currentLat = position.coords.latitude;
                    currentLon = position.coords.longitude;
                    console.log("Location fetched via GPS:", currentLat, currentLon);
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
            document.getElementById("login-lat").value = data.latitude;
            document.getElementById("login-lon").value = data.longitude;
            currentLat = data.latitude;
            currentLon = data.longitude;
            console.log("Location fetched via IP:", currentLat, currentLon);
        }
    } catch (e) {
        console.error("IP fallback failed:", e);
        document.getElementById("ip-error").innerText = "Location Error: Could not determine location.";
        document.getElementById("ip-error").classList.remove("hidden");
    }
}

fetchLocation();

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("login-password").value;
    const lat = document.getElementById("login-lat").value;
    const lon = document.getElementById("login-lon").value;

    try {
        const formData = new FormData();
        formData.append("password", password);
        formData.append("lat", lat);
        formData.append("lon", lon);
        
        const res = await fetch(`${SERVER_URL}/login`, {
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" },
            body: formData
        });
        const data = await res.json();
        
        if (data.status === "success") {
            adminToken = data.token;
            currentLat = parseFloat(lat);
            currentLon = parseFloat(lon);
            loginView.classList.add("hidden");
            kioskLink.classList.add("hidden");
            dashboardView.classList.remove("hidden");
            fetchLogs();
            fetchUsers();
        } else {
            loginError.innerText = "❌ " + data.message;
            loginError.classList.remove("hidden");
        }
    } catch (err) {
        loginError.innerText = "❌ Server Connection Failed";
        loginError.classList.remove("hidden");
    }
});

logoutBtn.addEventListener("click", () => {
    adminToken = "";
    loginForm.reset();
    dashboardView.classList.add("hidden");
    loginView.classList.remove("hidden");
    kioskLink.classList.remove("hidden");
    fetchLocation(); // Refresh location on logout
});

// Change Password Logic
const passwordModal = document.getElementById("password-modal");
document.getElementById("open-password-btn").addEventListener("click", () => {
    passwordModal.classList.remove("hidden");
});
document.getElementById("close-password-btn").addEventListener("click", () => {
    passwordModal.classList.add("hidden");
    document.getElementById("password-form").reset();
    document.getElementById("password-status").innerText = "";
});
document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const oldPass = document.getElementById("old-password").value;
    const newPass = document.getElementById("new-password").value;
    const statusEl = document.getElementById("password-status");
    
    statusEl.innerText = "Updating...";
    statusEl.className = "status-text";
    
    const formData = new FormData();
    formData.append("lat", currentLat);
    formData.append("lon", currentLon);
    formData.append("old_password", oldPass);
    formData.append("new_password", newPass);
    
    try {
        const res = await fetch(`${SERVER_URL}/change_password`, { 
            method: "POST", 
            headers: { "ngrok-skip-browser-warning": "true" }, 
            body: formData 
        });
        const data = await res.json();
        statusEl.innerText = data.message;
        statusEl.className = `status-text ${data.status === "success" ? "success-text" : "error-text"}`;
        if(data.status === "success") {
            setTimeout(() => {
                document.getElementById("close-password-btn").click();
            }, 1500);
        }
    } catch(err) {
        statusEl.innerText = "Server Connection Failed";
        statusEl.className = "status-text error-text";
    }
});

// Tab Logic
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
        
        if(btn.dataset.tab === "logs") fetchLogs();
        if(btn.dataset.tab === "update" || btn.dataset.tab === "remove") fetchUsers();
    });
});

// Logs Logic
const fetchLogsBtn = document.getElementById("fetch-logs-btn");
const filterName = document.getElementById("filter-name");
const logsTableBody = document.querySelector("#logs-table tbody");

async function fetchLogs() {
    let url = `${SERVER_URL}/logs?lat=${currentLat}&lon=${currentLon}`;
    if (filterName.value) {
        url += `&user_name=${filterName.value}`;
    }
    
    try {
        const res = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
        const data = await res.json();
        logsTableBody.innerHTML = "";
        
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${log.Date}</td>
                    <td>${log.Name}</td>
                    <td>${log["Check-In Time"]}</td>
                    <td>${log["Check-Out Time"]}</td>
                `;
                logsTableBody.appendChild(tr);
            });
        } else {
            logsTableBody.innerHTML = "<tr><td colspan='4'>No records found.</td></tr>";
        }
    } catch (err) {
        logsTableBody.innerHTML = "<tr><td colspan='4' class='error-text'>Failed to fetch logs.</td></tr>";
    }
}
fetchLogsBtn.addEventListener("click", fetchLogs);

// Users Logic
const updateNameSelect = document.getElementById("update-name");
const removeNameSelect = document.getElementById("remove-name");

async function fetchUsers() {
    try {
        const res = await fetch(`${SERVER_URL}/users?lat=${currentLat}&lon=${currentLon}`, { 
            headers: { "ngrok-skip-browser-warning": "true" } 
        });
        const data = await res.json();
        
        if (data.status === "success") {
            const options = data.users.map(u => `<option value="${u}">${u}</option>`).join("");
            updateNameSelect.innerHTML = options || "<option>No users found</option>";
            removeNameSelect.innerHTML = options || "<option>No users found</option>";
        }
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
}

// Add Employee
let stagedPhotos = [];
const stagedPhotosContainer = document.getElementById("staged-photos");
const stagedCountSpan = document.getElementById("staged-count");
const submitAddBtn = document.getElementById("submit-add-btn");

function updateStagedUI() {
    stagedPhotosContainer.innerHTML = "";
    stagedCountSpan.innerText = stagedPhotos.length;
    submitAddBtn.disabled = stagedPhotos.length === 0;
    
    stagedPhotos.forEach((photo, index) => {
        const div = document.createElement("div");
        div.style = "position: relative; width: 60px; height: 60px;";
        
        const img = document.createElement("img");
        img.src = photo.url;
        img.style = "width: 100%; height: 100%; object-fit: cover; border-radius: 4px;";
        
        const btn = document.createElement("button");
        btn.innerText = "×";
        btn.style = "position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; line-height: 1;";
        btn.onclick = (e) => {
            e.preventDefault();
            stagedPhotos.splice(index, 1);
            updateStagedUI();
        };
        
        div.appendChild(img);
        div.appendChild(btn);
        stagedPhotosContainer.appendChild(div);
    });
}

document.getElementById("add-images").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (stagedPhotos.length < 5) {
            stagedPhotos.push({
                type: 'file',
                data: file,
                url: URL.createObjectURL(file)
            });
        }
    });
    updateStagedUI();
    e.target.value = "";
});

let addStream = null;
const addWebcam = document.getElementById("add-webcam");
const cameraContainer = document.getElementById("camera-container");

document.getElementById("start-camera-btn").addEventListener("click", async () => {
    if (cameraContainer.classList.contains("hidden")) {
        try {
            addStream = await navigator.mediaDevices.getUserMedia({ video: true });
            addWebcam.srcObject = addStream;
            cameraContainer.classList.remove("hidden");
            document.getElementById("start-camera-btn").innerText = "Stop Camera";
        } catch (err) {
            alert("Camera access denied or unavailable.");
        }
    } else {
        if (addStream) {
            addStream.getTracks().forEach(t => t.stop());
            addStream = null;
        }
        cameraContainer.classList.add("hidden");
        document.getElementById("start-camera-btn").innerText = "Start Camera";
    }
});

document.getElementById("capture-btn").addEventListener("click", () => {
    if (stagedPhotos.length >= 5) {
        alert("Maximum 5 photos allowed.");
        return;
    }
    
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = addWebcam.videoWidth;
    tempCanvas.height = addWebcam.videoHeight;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(addWebcam, 0, 0);
    
    tempCanvas.toBlob((blob) => {
        stagedPhotos.push({
            type: 'blob',
            data: blob,
            url: URL.createObjectURL(blob)
        });
        updateStagedUI();
    }, "image/jpeg", 0.9);
});

document.getElementById("add-employee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("add-name").value;
    const statusEl = document.getElementById("add-status");
    
    if (stagedPhotos.length === 0 || stagedPhotos.length > 5) {
        statusEl.innerText = "Please provide between 1 and 5 photos.";
        statusEl.className = "status-text error-text";
        return;
    }

    statusEl.innerText = "Uploading to Server...";
    statusEl.className = "status-text";
    
    const formData = new FormData();
    formData.append("name", name);
    formData.append("lat", currentLat);
    formData.append("lon", currentLon);
    for (let i = 0; i < stagedPhotos.length; i++) {
        formData.append("files", stagedPhotos[i].data, `photo_${i}.jpg`);
    }

    try {
        const res = await fetch(`${SERVER_URL}/register`, { 
            method: "POST", 
            headers: { "ngrok-skip-browser-warning": "true" }, 
            body: formData 
        });
        const data = await res.json();
        statusEl.innerText = data.message;
        statusEl.className = `status-text ${data.status === "success" ? "success-text" : "error-text"}`;
        if(data.status === "success") {
            document.getElementById("add-employee-form").reset();
            stagedPhotos = [];
            updateStagedUI();
        }
    } catch (err) {
        statusEl.innerText = "Server Connection Failed";
        statusEl.className = "status-text error-text";
    }
});

// Update Employee
document.getElementById("update-employee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = updateNameSelect.value;
    const files = document.getElementById("update-images").files;
    const statusEl = document.getElementById("update-status");
    
    if (!files.length) return;

    statusEl.innerText = "Uploading to Server...";
    statusEl.className = "status-text";
    
    const formData = new FormData();
    formData.append("name", name);
    formData.append("lat", currentLat);
    formData.append("lon", currentLon);
    for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
    }

    try {
        const res = await fetch(`${SERVER_URL}/update`, { 
            method: "POST", 
            headers: { "ngrok-skip-browser-warning": "true" }, 
            body: formData 
        });
        const data = await res.json();
        statusEl.innerText = data.message;
        statusEl.className = `status-text ${data.status === "success" ? "success-text" : "error-text"}`;
        if(data.status === "success") document.getElementById("update-employee-form").reset();
    } catch (err) {
        statusEl.innerText = "Server Connection Failed";
        statusEl.className = "status-text error-text";
    }
});

// Remove Employee
document.getElementById("remove-btn").addEventListener("click", async () => {
    const name = removeNameSelect.value;
    const statusEl = document.getElementById("remove-status");
    
    if (!name || name === "No users found") return;
    
    if (!confirm(`Are you sure you want to completely delete ${name}?`)) return;

    const formData = new FormData();
    formData.append("name", name);
    formData.append("lat", currentLat);
    formData.append("lon", currentLon);

    try {
        const res = await fetch(`${SERVER_URL}/delete`, { 
            method: "POST", 
            headers: { "ngrok-skip-browser-warning": "true" }, 
            body: formData 
        });
        const data = await res.json();
        statusEl.innerText = data.message;
        statusEl.className = `status-text ${data.status === "success" ? "success-text" : "error-text"}`;
        if(data.status === "success") fetchUsers();
    } catch (err) {
        statusEl.innerText = "Server Connection Failed";
        statusEl.className = "status-text error-text";
    }
});
