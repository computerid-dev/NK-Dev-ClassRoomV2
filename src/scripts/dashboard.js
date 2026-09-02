import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  arrayUnion,
} from "./firebase-init.js";
import { showToast, randomDigits, requireFields } from "./utils.js";

const $ = (sel) => document.querySelector(sel);
let currentUser = null;
let currentProfile = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/index.html";
    return;
  }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  currentProfile = snap.exists() ? snap.data() : {};

  if (currentProfile.blocked) {
    await signOut(auth);
    alert("Akun kamu diblokir oleh admin. Hubungi admin kalau ini keliru.");
    window.location.href = "/index.html";
    return;
  }

  $("#me-name").textContent = `${currentProfile.namaLengkap || user.email} (${currentProfile.role || "-"})`;
  if (currentProfile.role === "guru") $("#btn-create").style.display = "inline-flex";
  loadRooms();
  maybePrefillJoinFromLink();
});

$("#btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/index.html";
});

/* ---------- Modal helpers ---------- */
function openModal(id) { $(`#${id}`).style.display = "flex"; }
function closeModal(id) { $(`#${id}`).style.display = "none"; }
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
$("#btn-create").addEventListener("click", () => openModal("create-modal"));
$("#btn-join").addEventListener("click", () => openModal("join-modal"));

function maybePrefillJoinFromLink() {
  const params = new URLSearchParams(window.location.search);
  const uid8 = params.get("join");
  if (uid8) {
    $("#join-uid").value = uid8;
    openModal("join-modal");
  }
}

/* ---------- Render daftar room ---------- */
function roomCard(id, room, myRole) {
  const div = document.createElement("div");
  div.className = "card room-card";
  const badgeText = { mainAdmin: "Admin utama", admin: "Admin", pending: "Menunggu approve", member: "Murid" }[myRole];
  const badgeClass = myRole === "pending" ? "badge-muted" : "badge-primary";
  div.innerHTML = `
    <div class="row spread">
      <span class="room-name">${room.roomName}</span>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="hint" style="color: var(--color-text-muted); font-size: 13px;">
      Jam ${room.waktuMulai}–${room.waktuSelesai} · min. ${room.minMurid} murid
    </div>
  `;
  if (myRole !== "pending") {
    div.style.cursor = "pointer";
    div.addEventListener("click", () => {
      window.location.href = `/room.html?id=${id}`;
    });
  }
  return div;
}

function loadRooms() {
  const uid = currentUser.uid;
  const grid = $("#room-grid");
  const empty = $("#empty-state");
  const pendingNote = $("#pending-note");

  const qMember = query(collection(db, "rooms"), where("members", "array-contains", uid));
  const qAdmin = query(collection(db, "rooms"), where("admins", "array-contains", uid));
  const qPending = query(collection(db, "rooms"), where("pending", "array-contains", uid));

  let memberRooms = [];
  let adminRooms = [];
  let pendingRooms = [];

  function render() {
    grid.innerHTML = "";
    const seen = new Set();
    let anyPending = false;

    adminRooms.forEach(({ id, data }) => {
      if (seen.has(id)) return;
      seen.add(id);
      const role = data.mainAdminUid === uid ? "mainAdmin" : "admin";
      grid.appendChild(roomCard(id, data, role));
    });
    memberRooms.forEach(({ id, data }) => {
      if (seen.has(id)) return;
      seen.add(id);
      grid.appendChild(roomCard(id, data, "member"));
    });
    pendingRooms.forEach(({ id, data }) => {
      if (seen.has(id)) return;
      seen.add(id);
      anyPending = true;
      grid.appendChild(roomCard(id, data, "pending"));
    });

    pendingNote.style.display = anyPending ? "block" : "none";
    empty.style.display = grid.children.length === 0 ? "block" : "none";
  }

  onSnapshot(qMember, (snap) => {
    memberRooms = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    render();
  });
  onSnapshot(qAdmin, (snap) => {
    adminRooms = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    render();
  });
  onSnapshot(qPending, (snap) => {
    pendingRooms = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    render();
  });
}

/* ---------- Buat room (guru saja) ---------- */
$("#create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#create-error");
  errEl.hidden = true;

  const roomName = $("#room-name").value.trim();
  const waktuMulai = $("#room-start").value;
  const waktuSelesai = $("#room-end").value;
  const minMurid = Number($("#room-min-murid").value);
  const passwordKelas = $("#room-password").value;
  const keyKedua = $("#room-key2").value;

  if (waktuMulai < "06:30" || waktuMulai > "07:30") {
    errEl.textContent = "Jam masuk harus antara 06:30 dan 07:30.";
    errEl.hidden = false;
    return;
  }
  if (waktuSelesai < "13:30" || waktuSelesai > "15:30") {
    errEl.textContent = "Jam selesai harus antara 13:30 dan 15:30.";
    errEl.hidden = false;
    return;
  }
  if (passwordKelas.length < 12 || passwordKelas.length > 100 || !/^[A-Za-z0-9]+$/.test(passwordKelas)) {
    errEl.textContent = "Password kelas harus 12-100 karakter, huruf/angka saja.";
    errEl.hidden = false;
    return;
  }
  if (!/^[0-9]{6}$/.test(keyKedua)) {
    errEl.textContent = "Key kedua harus persis 6 digit angka.";
    errEl.hidden = false;
    return;
  }

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const uid8 = randomDigits(8);
    const roomRef = await addDoc(collection(db, "rooms"), {
      roomName,
      waktuMulai,
      waktuSelesai,
      minMurid,
      passwordKelas,
      keyKedua,
      uid8,
      mainAdminUid: currentUser.uid,
      admins: [currentUser.uid],
      members: [currentUser.uid],
      pending: [],
      createdAt: Date.now(),
    });

    closeModal("create-modal");
    e.target.reset();

    $("#result-uid").textContent = uid8;
    $("#result-key2").textContent = keyKedua;
    $("#result-link").textContent = `${window.location.origin}/dashboard.html?join=${uid8}`;
    openModal("result-modal");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Gagal membuat room, coba lagi.";
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------- Ajukan gabung room ---------- */
$("#join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#join-error");
  errEl.hidden = true;

  const uid8 = $("#join-uid").value.trim();
  const keyKedua = $("#join-key2").value.trim();

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const q = query(collection(db, "rooms"), where("uid8", "==", uid8), where("keyKedua", "==", keyKedua));
    const snap = await getDocs(q);
    if (snap.empty) {
      errEl.textContent = "Kode kelas atau key kedua salah.";
      errEl.hidden = false;
      return;
    }
    const roomDoc = snap.docs[0];
    const room = roomDoc.data();
    const uid = currentUser.uid;

    if (room.admins?.includes(uid) || room.members?.includes(uid)) {
      showToast("Kamu sudah jadi bagian dari kelas ini");
      closeModal("join-modal");
      return;
    }
    if (room.pending?.includes(uid)) {
      showToast("Kamu sudah mengajukan, tinggal tunggu admin");
      closeModal("join-modal");
      return;
    }

    await setDoc(doc(db, "rooms", roomDoc.id), { pending: arrayUnion(uid) }, { merge: true });
    showToast("Pengajuan terkirim, tunggu admin menyetujui ya");
    closeModal("join-modal");
    e.target.reset();
  } catch (err) {
    console.error(err);
    errEl.textContent = "Gagal mengajukan gabung, coba lagi.";
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});
