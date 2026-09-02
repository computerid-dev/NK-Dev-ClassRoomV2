import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from "./firebase-init.js";
import { compressImageToBase64, showToast, isWithinTimeRange, minutesBeforeStart } from "./utils.js";

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(window.location.search);
const roomId = params.get("id");

if (!roomId) window.location.href = "/dashboard.html";

let currentUser = null;
let room = null;
let isAdmin = false;
let isMainAdmin = false;
const profileCache = {};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/index.html";
    return;
  }
  currentUser = user;
  watchRoom();
  watchMessages();
});

async function getProfile(uid) {
  if (profileCache[uid]) return profileCache[uid];
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : { namaLengkap: "Pengguna" };
  profileCache[uid] = data;
  return data;
}

function accessState() {
  if (!room) return { allowed: false, reason: "" };
  if (isAdmin) {
    const before = minutesBeforeStart(room.waktuMulai);
    const withinDay = isWithinTimeRange(room.waktuMulai, room.waktuSelesai);
    const earlyWindow = before > 0 && before <= 30;
    if (withinDay || earlyWindow) return { allowed: true };
    return { allowed: false, reason: `Kelas dibuka jam ${room.waktuMulai} (admin bisa masuk 30 menit lebih awal) sampai ${room.waktuSelesai}.` };
  }
  if (isWithinTimeRange(room.waktuMulai, room.waktuSelesai)) return { allowed: true };
  return { allowed: false, reason: `Kelas hanya buka jam ${room.waktuMulai}–${room.waktuSelesai}.` };
}

function applyAccessState() {
  const { allowed, reason } = accessState();
  const banner = $("#locked-banner");
  const form = $("#chat-form");
  if (allowed) {
    banner.style.display = "none";
    form.querySelectorAll("input, button").forEach((el) => (el.disabled = false));
  } else {
    banner.style.display = "block";
    banner.textContent = reason;
    form.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
  }
}

setInterval(applyAccessState, 30000);

function watchRoom() {
  onSnapshot(doc(db, "rooms", roomId), async (snap) => {
    if (!snap.exists()) {
      showToast("Room tidak ditemukan");
      window.location.href = "/dashboard.html";
      return;
    }
    room = snap.data();
    const uid = currentUser.uid;
    isAdmin = room.admins?.includes(uid);
    isMainAdmin = room.mainAdminUid === uid;

    if (!isAdmin && !room.members?.includes(uid)) {
      showToast("Kamu belum jadi anggota room ini");
      window.location.href = "/dashboard.html";
      return;
    }

    $("#sidebar-room-name").textContent = room.roomName;
    $("#sidebar-room-time").textContent = `Jam ${room.waktuMulai}–${room.waktuSelesai} · min. ${room.minMurid} murid`;
    $("#btn-toggle-sidebar").style.display = "inline-flex";
    $("#admin-panel").style.display = isAdmin ? "block" : "none";

    applyAccessState();
    renderPending();
    renderMembers();
  });
}

async function renderPending() {
  const wrap = $("#pending-list");
  if (!isAdmin) return;
  wrap.innerHTML = "";
  const pending = room.pending || [];
  if (pending.length === 0) {
    wrap.innerHTML = `<p class="hint" style="font-size:12px;">Tidak ada pengajuan.</p>`;
    return;
  }
  for (const uid of pending) {
    const profile = await getProfile(uid);
    const row = document.createElement("div");
    row.className = "pending-row";
    row.innerHTML = `
      <span style="font-size:13px;">${profile.namaLengkap || "Pengguna"}</span>
      <button class="btn btn-primary btn-sm" data-accept="${uid}">Terima</button>
    `;
    wrap.appendChild(row);
  }
  wrap.querySelectorAll("[data-accept]").forEach((btn) => {
    btn.addEventListener("click", () => acceptMember(btn.dataset.accept));
  });
}

async function acceptMember(uid) {
  const profile = await getProfile(uid);
  const updates = {
    pending: arrayRemove(uid),
    members: arrayUnion(uid),
  };
  // Guru yang diterima gabung otomatis jadi admin (bukan admin utama).
  if (profile.role === "guru") {
    updates.admins = arrayUnion(uid);
  }
  await setDoc(doc(db, "rooms", roomId), updates, { merge: true });
  showToast(`${profile.namaLengkap} diterima`);
}

async function renderMembers() {
  const wrap = $("#member-list");
  wrap.innerHTML = "";
  const members = room.members || [];
  for (const uid of members) {
    const profile = await getProfile(uid);
    const isThisMain = room.mainAdminUid === uid;
    const isThisAdmin = room.admins?.includes(uid);
    const label = isThisMain ? "Admin utama" : isThisAdmin ? "Admin" : "Murid";
    const li = document.createElement("li");
    const canKick = isAdmin && !isThisMain && uid !== currentUser.uid;
    li.innerHTML = `
      <span>${profile.namaLengkap || "Pengguna"} <span class="hint" style="font-size:11px;">· ${label}</span></span>
      ${canKick ? `<button class="btn btn-danger btn-sm" data-kick="${uid}">Kick</button>` : ""}
    `;
    wrap.appendChild(li);
  }
  wrap.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () => kickMember(btn.dataset.kick));
  });
}

async function kickMember(uid) {
  if (!confirm("Yakin mau keluarkan anggota ini dari room?")) return;
  await setDoc(
    doc(db, "rooms", roomId),
    { members: arrayRemove(uid), admins: arrayRemove(uid) },
    { merge: true }
  );
  showToast("Anggota dikeluarkan dari room");
}

$("#btn-toggle-sidebar").addEventListener("click", () => {
  $("#room-sidebar").classList.toggle("open");
});

/* ---------- Chat ---------- */
function watchMessages() {
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"), limit(200));
  onSnapshot(q, async (snap) => {
    const wrap = $("#chat-messages");
    wrap.innerHTML = "";
    for (const docSnap of snap.docs) {
      const msg = docSnap.data();
      const mine = msg.senderUid === currentUser.uid;
      const div = document.createElement("div");
      div.className = `msg${mine ? " mine" : ""}`;
      const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
      div.innerHTML = `
        <div class="msg-meta">${mine ? "Kamu" : msg.senderName} · ${time}</div>
        <div>${escapeHtml(msg.text || "")}</div>
        ${msg.image ? `<img src="${msg.image}" alt="Lampiran gambar" />` : ""}
      `;
      wrap.appendChild(div);
    }
    wrap.scrollTop = wrap.scrollHeight;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { allowed } = accessState();
  if (!allowed) return;

  const textInput = $("#chat-text");
  const imageInput = $("#chat-image");
  const text = textInput.value.trim();
  const file = imageInput.files[0];

  if (!text && !file) return;

  const profile = await getProfile(currentUser.uid);
  const payload = {
    senderUid: currentUser.uid,
    senderName: profile.namaLengkap || "Pengguna",
    text,
    createdAt: Date.now(),
  };

  if (file) {
    try {
      payload.image = await compressImageToBase64(file, { maxDimension: 640, quality: 0.65 });
    } catch (err) {
      showToast(err.message);
      return;
    }
  }

  await addDoc(collection(db, "rooms", roomId, "messages"), payload);
  textInput.value = "";
  imageInput.value = "";
});
