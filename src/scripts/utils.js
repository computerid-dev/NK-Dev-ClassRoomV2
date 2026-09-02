// Kompres file gambar jadi base64 supaya muat disimpan sebagai field Firestore.
// Dipakai untuk avatar profil dan gambar soal di chat.
// maxDimension & quality sengaja dibuat kecil karena batas 1 dokumen Firestore = 1MB.
export function compressImageToBase64(file, { maxDimension = 480, quality = 0.6 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file gambar"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("File bukan gambar yang valid"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", quality);
        if (base64.length > 700_000) {
          reject(new Error("Ukuran gambar masih terlalu besar, coba pakai foto lain"));
          return;
        }
        resolve(base64);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function randomDigits(length) {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export function showToast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

export function requireFields(values) {
  return Object.entries(values)
    .filter(([, v]) => v === undefined || v === null || String(v).trim() === "")
    .map(([k]) => k);
}

// Cek apakah waktu sekarang (jam:menit lokal) ada di dalam rentang [start, end].
// start/end format "HH:MM".
export function isWithinTimeRange(start, end) {
  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

export function minutesBeforeStart(start) {
  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return startMinutes - nowMinutes;
}
