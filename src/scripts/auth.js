import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  doc,
  setDoc,
} from "./firebase-init.js";
import { compressImageToBase64, showToast, requireFields } from "./utils.js";
import { DAFTAR_AGAMA, DAFTAR_MAPEL } from "./constants.js";

const $ = (sel) => document.querySelector(sel);

// Kalau sudah login, langsung lempar ke dashboard.
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "/dashboard.html";
});

/* ---------- Buka/tutup modal ---------- */
function openModal(id) {
  $(`#${id}`).style.display = "flex";
}
function closeModal(id) {
  $(`#${id}`).style.display = "none";
}
$("#nav-login").addEventListener("click", () => openModal("login-modal"));
$("#hero-login").addEventListener("click", () => openModal("login-modal"));
$("#nav-register").addEventListener("click", () => openModal("register-modal"));
$("#hero-register").addEventListener("click", () => openModal("register-modal"));
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

/* ---------- Isi opsi agama & mapel ---------- */
const agamaSelect = $("#reg-agama-guru");
DAFTAR_AGAMA.forEach((a) => {
  const opt = document.createElement("option");
  opt.value = a;
  opt.textContent = a;
  agamaSelect.appendChild(opt);
});

const mapelWrap = $("#mapel-options");
DAFTAR_MAPEL.forEach((m) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip-option";
  chip.textContent = m;
  chip.dataset.mapel = m;
  chip.addEventListener("click", () => {
    const selected = mapelWrap.querySelectorAll(".selected");
    if (!chip.classList.contains("selected") && selected.length >= 2) {
      showToast("Maksimal 2 mata pelajaran");
      return;
    }
    chip.classList.toggle("selected");
  });
  mapelWrap.appendChild(chip);
});

/* ---------- Toggle role Guru / Murid ---------- */
let currentRole = "guru";
document.querySelectorAll("[data-role]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-role]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRole = btn.dataset.role;
    $("#fields-guru").style.display = currentRole === "guru" ? "block" : "none";
    $("#fields-murid").style.display = currentRole === "murid" ? "block" : "none";
    $("#avatar-hint").textContent =
      currentRole === "murid"
        ? "Wajib foto wajah pakai seragam putih, sebahu."
        : "Boleh foto bebas.";
  });
});

/* ---------- Toggle jenis guru: wali / pengajar ---------- */
let guruType = "wali";
document.querySelectorAll("[data-guru-type]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-guru-type]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    guruType = btn.dataset.guruType;
    $("#field-kelas-wali").style.display = guruType === "wali" ? "block" : "none";
    $("#field-mapel").style.display = guruType === "pengajar" ? "block" : "none";
  });
});

/* ---------- Submit login ---------- */
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#login-error");
  errEl.hidden = true;
  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-password").value);
    window.location.href = "/dashboard.html";
  } catch (err) {
    errEl.textContent = "Email atau password salah, coba lagi.";
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------- Submit daftar ---------- */
$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#register-error");
  errEl.hidden = true;

  const namaLengkap = $("#reg-nama").value.trim().toUpperCase();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  const noTelp = $("#reg-telp").value.trim();
  const avatarFile = $("#reg-avatar").files[0];

  const baseMissing = requireFields({ namaLengkap, email, password, noTelp, avatarFile });
  if (baseMissing.length) {
    errEl.textContent = "Lengkapi semua data dulu ya.";
    errEl.hidden = false;
    return;
  }

  let extra = {};
  if (currentRole === "guru") {
    const agama = $("#reg-agama-guru").value;
    const gender = $("#reg-gender-guru").value;
    if (guruType === "wali") {
      const kelasWali = $("#reg-kelas-wali").value.trim();
      if (!kelasWali) {
        errEl.textContent = "Isi kelas wali dulu.";
        errEl.hidden = false;
        return;
      }
      extra = { guruType, kelasWali, agama, gender };
    } else {
      const mapel = [...mapelWrap.querySelectorAll(".selected")].map((c) => c.dataset.mapel);
      if (mapel.length === 0) {
        errEl.textContent = "Pilih minimal 1 mata pelajaran.";
        errEl.hidden = false;
        return;
      }
      extra = { guruType, mapel, agama, gender };
    }
  } else {
    const kelasMurid = $("#reg-kelas-murid").value.trim();
    if (!kelasMurid) {
      errEl.textContent = "Isi kelas dulu.";
      errEl.hidden = false;
      return;
    }
    extra = { kelasMurid };
  }

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Menyimpan...";

  try {
    const avatarBase64 = await compressImageToBase64(avatarFile, {
      maxDimension: currentRole === "murid" ? 360 : 480,
      quality: 0.6,
    });

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      role: currentRole,
      namaLengkap,
      email,
      noTelp,
      avatar: avatarBase64,
      ...extra,
      createdAt: Date.now(),
    });

    window.location.href = "/dashboard.html";
  } catch (err) {
    console.error(err);
    errEl.textContent =
      err.code === "auth/email-already-in-use"
        ? "Email ini sudah terdaftar."
        : err.message || "Gagal membuat akun, coba lagi.";
    errEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Simpan & buat akun";
  }
});
