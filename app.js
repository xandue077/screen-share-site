const $ = (id) => document.getElementById(id);

const els = {
  includeAudio: $("includeAudio"),
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  offer: $("offer"),
  answerInput: $("answerInput"),
  applyAnswerBtn: $("applyAnswerBtn"),
  localPreview: $("localPreview"),
  broadcasterStatus: $("broadcasterStatus"),
  copyOfferBtn: $("copyOfferBtn"),
  offerInput: $("offerInput"),
  answer: $("answer"),
  createAnswerBtn: $("createAnswerBtn"),
  remoteVideo: $("remoteVideo"),
  viewerStatus: $("viewerStatus"),
  copyAnswerBtn: $("copyAnswerBtn"),
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let senderPc = null;
let senderStream = null;
let viewerPc = null;

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

function parseDescription(text, expectedType, label) {
  const raw = text.trim();
  if (!raw) throw new Error(`${label} is empty`);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!value || value.type !== expectedType || !value.sdp) {
    throw new Error(`${label} must be a WebRTC ${expectedType}`);
  }
  return value;
}

async function waitForIce(pc, timeoutMs = 12000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, timeoutMs);
    pc.addEventListener("icegatheringstatechange", done);
  });
}

function watchConnection(pc, target) {
  pc.addEventListener("connectionstatechange", () => {
    const state = pc.connectionState;
    if (state === "connected") setStatus(target, "Connected.", "good");
    else if (state === "failed" || state === "disconnected" || state === "closed") setStatus(target, `Connection ${state}.`, "bad");
    else setStatus(target, `Connection ${state}.`);
  });
}

async function copyText(text, button, original) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function closeSender() {
  if (senderStream) {
    for (const track of senderStream.getTracks()) track.stop();
    senderStream = null;
  }
  if (senderPc) {
    senderPc.close();
    senderPc = null;
  }
  els.localPreview.srcObject = null;
  els.stopBtn.disabled = true;
}

els.stopBtn.disabled = true;

els.startBtn.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("This browser does not support screen capture");
    }
    closeSender();
    senderStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: els.includeAudio.checked,
    });
    els.localPreview.srcObject = senderStream;
    senderPc = new RTCPeerConnection(rtcConfig);
    watchConnection(senderPc, els.broadcasterStatus);
    for (const track of senderStream.getTracks()) senderPc.addTrack(track, senderStream);

    const videoTrack = senderStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.addEventListener("ended", closeSender);

    const offer = await senderPc.createOffer();
    await senderPc.setLocalDescription(offer);
    await waitForIce(senderPc);
    els.offer.value = JSON.stringify(senderPc.localDescription);
    els.stopBtn.disabled = false;
    setStatus(els.broadcasterStatus, "Screen captured. Send the offer to the viewer.");
  } catch (error) {
    setStatus(els.broadcasterStatus, error.message || "Could not start sharing", "bad");
  }
});

els.applyAnswerBtn.addEventListener("click", async () => {
  try {
    if (!senderPc) throw new Error("Start sharing first");
    const answer = parseDescription(els.answerInput.value, "answer", "Viewer answer");
    await senderPc.setRemoteDescription(answer);
    setStatus(els.broadcasterStatus, "Answer accepted. Waiting for connection.");
  } catch (error) {
    setStatus(els.broadcasterStatus, error.message || "Could not apply answer", "bad");
  }
});

els.createAnswerBtn.addEventListener("click", async () => {
  try {
    if (viewerPc) viewerPc.close();
    const offer = parseDescription(els.offerInput.value, "offer", "Broadcaster offer");
    viewerPc = new RTCPeerConnection(rtcConfig);
    watchConnection(viewerPc, els.viewerStatus);
    viewerPc.addEventListener("track", (event) => {
      els.remoteVideo.srcObject = event.streams[0];
      els.remoteVideo.play().catch(() => {});
    });

    await viewerPc.setRemoteDescription(offer);
    const answer = await viewerPc.createAnswer();
    await viewerPc.setLocalDescription(answer);
    await waitForIce(viewerPc);
    els.answer.value = JSON.stringify(viewerPc.localDescription);
    setStatus(els.viewerStatus, "Answer ready. Send it back to the broadcaster.");
  } catch (error) {
    setStatus(els.viewerStatus, error.message || "Could not create answer", "bad");
  }
});

els.copyOfferBtn.addEventListener("click", () => {
  if (!els.offer.value.trim()) return;
  copyText(els.offer.value, els.copyOfferBtn, els.copyOfferBtn.textContent);
});

els.copyAnswerBtn.addEventListener("click", () => {
  if (!els.answer.value.trim()) return;
  copyText(els.answer.value, els.copyAnswerBtn, els.copyAnswerBtn.textContent);
});
