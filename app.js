import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcXaR-NZF76jtLdbagZ6qJRflm5MYCkFo",
  authDomain: "discountapp-9edd0.firebaseapp.com",
  projectId: "discountapp-9edd0",
  storageBucket: "discountapp-9edd0.appspot.com",
  messagingSenderId: "778128441094",
  appId: "1:778128441094:web:af89389599aaa214476887"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const METRICS = [
  { id: "weight", label: "Вес", unit: "кг" },
  { id: "waist", label: "Талия", unit: "см" },
  { id: "hips", label: "Бёдра", unit: "см" },
  { id: "chest", label: "Грудь", unit: "см" },
  { id: "shoulders", label: "Плечи", unit: "см" },
  { id: "bicep", label: "Бицепс", unit: "см" },
  { id: "thigh", label: "Бедро", unit: "см" },
  { id: "calf", label: "Голень", unit: "см" },
  { id: "neck", label: "Шея", unit: "см" },
  { id: "forearm", label: "Предплечье", unit: "см" },
  { id: "head", label: "Голова", unit: "см" },
  { id: "foot", label: "Стопа", unit: "см" },
  { id: "bodyFat", label: "% жира", unit: "%" },
  { id: "bmi", label: "ИМТ", unit: "" }
];

const metricSelect = document.getElementById("metricSelect");
METRICS.forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.unit ? `${m.label} (${m.unit})` : m.label;
  metricSelect.appendChild(opt);
});

const deviceIdEl = document.getElementById("deviceId");
const formStatusEl = document.getElementById("formStatus");

signInAnonymously(auth).catch((err) => console.error("Anonymous sign-in failed", err));

onAuthStateChanged(auth, (user) => {
  if (user) deviceIdEl.textContent = `ID устройства: ${user.uid}`;
});

function showPermissionError(err) {
  if (err.code === "permission-denied") {
    formStatusEl.textContent =
      "Нет прав на запись с этого устройства. Добавь ID устройства (сверху страницы) в правила Firestore.";
  } else {
    formStatusEl.textContent = `Ошибка: ${err.message}`;
  }
}

let entriesByMetric = {};
const charts = {};

async function loadGoal() {
  const snap = await getDoc(doc(db, "bodySettings", "goal"));
  const input = document.getElementById("goalWeightInput");
  input.value = snap.exists() ? snap.data().weight ?? "" : "";
}

document.getElementById("saveGoalBtn").addEventListener("click", async () => {
  const value = parseFloat(document.getElementById("goalWeightInput").value);
  if (Number.isNaN(value)) return;
  try {
    await setDoc(doc(db, "bodySettings", "goal"), { weight: value });
    formStatusEl.textContent = "Цель сохранена.";
  } catch (err) {
    showPermissionError(err);
  }
});

async function loadEntries() {
  const snap = await getDocs(collection(db, "bodyMetrics"));
  const grouped = {};
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!grouped[data.metric]) grouped[data.metric] = [];
    grouped[data.metric].push({ id: docSnap.id, date: data.date, value: data.value });
  });
  Object.values(grouped).forEach((list) => list.sort((a, b) => a.date.localeCompare(b.date)));
  entriesByMetric = grouped;
}

function renderCharts() {
  const container = document.getElementById("chartsContainer");
  container.innerHTML = "";

  METRICS.forEach((m) => {
    const list = entriesByMetric[m.id] || [];
    if (list.length === 0) return;

    const block = document.createElement("div");
    block.className = "metric-block card";

    const title = document.createElement("h2");
    title.textContent = m.unit ? `${m.label} (${m.unit})` : m.label;
    block.appendChild(title);

    const canvas = document.createElement("canvas");
    block.appendChild(canvas);

    const ul = document.createElement("ul");
    ul.className = "entry-list";
    // Newest first for the list, independent of the chart's chronological order.
    [...list].reverse().forEach((entry) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = `${entry.date}: ${entry.value}${m.unit}`;
      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.className = "delete-btn";
      delBtn.addEventListener("click", () => deleteEntry(entry.id));
      li.appendChild(span);
      li.appendChild(delBtn);
      ul.appendChild(li);
    });
    block.appendChild(ul);

    container.appendChild(block);

    charts[m.id] = new Chart(canvas, {
      type: "line",
      data: {
        labels: list.map((e) => e.date),
        datasets: [
          {
            label: m.label,
            data: list.map((e) => e.value),
            borderColor: "#4f8fdb",
            backgroundColor: "rgba(79, 143, 219, 0.15)",
            tension: 0.25,
            fill: true,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } }
      }
    });
  });
}

async function deleteEntry(id) {
  if (!confirm("Удалить эту запись?")) return;
  try {
    await deleteDoc(doc(db, "bodyMetrics", id));
    await refresh();
  } catch (err) {
    showPermissionError(err);
  }
}

document.getElementById("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const metric = metricSelect.value;
  const date = document.getElementById("dateInput").value;
  const value = parseFloat(document.getElementById("valueInput").value);
  if (!date || Number.isNaN(value)) return;

  try {
    await addDoc(collection(db, "bodyMetrics"), { metric, date, value, createdAt: serverTimestamp() });
    formStatusEl.textContent = "Добавлено.";
    document.getElementById("valueInput").value = "";
    await refresh();
  } catch (err) {
    showPermissionError(err);
  }
});

async function refresh() {
  await loadEntries();
  renderCharts();
}

await loadGoal();
await refresh();
