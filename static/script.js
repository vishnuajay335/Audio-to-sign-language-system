const recordButton = document.getElementById('recordButton');
const btnText = document.getElementById('btnText');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptionText = document.getElementById('transcriptionText');
const signVideo = document.getElementById('signVideo');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const currentWordDisplay = document.getElementById('currentWord');

let recorder;
let isRecording = false;
let videoQueue = [];
let isPlaying = false;

// Initialize RecordRTC for clean WAV capture
let stream = null;
async function setupRecorder() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error("Microphone access denied or error:", err);
        alert("Please allow microphone access to use this application.");
    }
}

// Toggle Recording on Button Click
recordButton.addEventListener('click', async () => {
    if (!stream) await setupRecorder();
    if (!stream) return;

    if (!isRecording) {
        // Re-initialize recorder to clear previous buffers
        recorder = new RecordRTC(stream, {
            type: 'audio',
            mimeType: 'audio/wav',
            recorderType: StereoAudioRecorder,
            numberOfAudioChannels: 1, // Mono
            desiredSampRate: 16000     // 16kHz for speech recognition
        });
        // Start Recording
        recorder.startRecording();
        isRecording = true;

        // Update UI
        recordButton.classList.add('recording');
        btnText.textContent = "Stop Recording";
        recordingStatus.classList.remove('hidden');
        transcriptionText.textContent = "Listening...";
        transcriptionText.classList.remove('placeholder-text');

        // Clear video player 
        videoQueue = [];
        isPlaying = false;
        signVideo.pause();
        signVideo.removeAttribute('src');
        signVideo.load();
        signVideo.style.display = 'none';
        videoPlaceholder.style.display = 'block';
        currentWordDisplay.textContent = "--";
    } else {
        // Stop Recording
        isRecording = false;

        // Update UI
        recordButton.classList.remove('recording');
        btnText.textContent = "Start Recording";
        recordingStatus.classList.add('hidden');
        transcriptionText.textContent = "Processing speech...";

        recorder.stopRecording(async () => {
            const audioBlob = recorder.getBlob();
            await sendAudioToBackend(audioBlob);
        });
    }
});

// Send captured audio via API
async function sendAudioToBackend(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
        const response = await fetch('/api/process-audio', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            // Display Original Transcribed Text
            transcriptionText.textContent = data.original_text;

            // Queue Videos
            if (data.video_sequence && data.video_sequence.length > 0) {
                videoQueue = data.video_sequence;
                if (!isPlaying) {
                    playNextVideo();
                }
            } else {
                currentWordDisplay.textContent = "No valid words found.";
            }

        } else {
            transcriptionText.textContent = "Error: " + data.error;
            transcriptionText.classList.add('placeholder-text');
        }
    } catch (error) {
        console.error("API error:", error);
        transcriptionText.textContent = "Error connecting to server.";
    }
}

// Sequential Video Player Logic
function playNextVideo() {
    if (videoQueue.length === 0) {
        isPlaying = false;
        setTimeout(() => {
            signVideo.style.display = 'none';
            videoPlaceholder.style.display = 'block';
            currentWordDisplay.textContent = "--";
        }, 1000); // 1 sec delay before hiding the player after sequence ends
        return;
    }

    isPlaying = true;
    const currentItem = videoQueue.shift();

    // Switch Views
    videoPlaceholder.style.display = 'none';
    signVideo.style.display = 'block';

    // Update Currently Spoken Word/Letter text
    if (currentItem.type === 'letter') {
        currentWordDisplay.textContent = `Letter: ${currentItem.word}`;
    } else {
        currentWordDisplay.textContent = currentItem.word;
    }

    // Set source
    signVideo.src = currentItem.url;
    signVideo.load();

    // Play video when ready
    signVideo.oncanplay = () => {
        // Reduce playback speed so 1-2 second clips are easily readable
        // This directly meets the user's requirement to properly analyze short videos
        signVideo.playbackRate = 0.65;
        signVideo.play();
    };

    // When video ends, play the next one in the queue
    signVideo.onended = () => {
        // Small pause between multiple videos makes it feel more natural
        setTimeout(playNextVideo, 400);
    };

    // Fallback if video fails to load (e.g. 404 URL)
    signVideo.onerror = () => {
        console.error("Could not play video:", currentItem.url);
        // Skip and play next
        playNextVideo();
    };
}
