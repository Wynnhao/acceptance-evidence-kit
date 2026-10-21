// 迷你销售看板 — 演示样例站逻辑（约 60 行，故意可被验收链各类检查覆盖）
async function loadItems() {
  const res = await fetch("/data/items.csv");
  const text = await res.text();
  const rows = text.trim().split("\n").slice(1); // 去表头
  const list = document.getElementById("item-list");
  const counter = document.getElementById("counter");
  list.innerHTML = "";
  let total = 0;
  for (const row of rows) {
    const cols = row.split(",");
    const name = cols[0];
    const amount = Number(cols[1]);
    if (!name || Number.isNaN(amount)) continue;
    const li = document.createElement("li");
    li.dataset.testid = "item-row";
    li.textContent = `${name} · ¥${amount}`;
    list.appendChild(li);
    total += amount;
  }
  counter.textContent = `合计 ${list.children.length} 笔 · ¥${total}`;
}

function initTabs() {
  const sales = document.getElementById("tab-sales");
  const tasks = document.getElementById("tab-tasks");
  sales.addEventListener("click", () => {
    sales.classList.add("active"); tasks.classList.remove("active");
    document.getElementById("panel-sales").classList.remove("hidden");
    document.getElementById("panel-tasks").classList.add("hidden");
  });
  tasks.addEventListener("click", () => {
    tasks.classList.add("active"); sales.classList.remove("active");
    document.getElementById("panel-tasks").classList.remove("hidden");
    document.getElementById("panel-sales").classList.add("hidden");
  });
}

let extra = 0;
function initAdd() {
  document.getElementById("add-btn").addEventListener("click", () => {
    extra += 1;
    const li = document.createElement("li");
    li.dataset.testid = "item-row";
    li.textContent = `手工补录 #${extra} · ¥0`;
    document.getElementById("item-list").appendChild(li);
  });
}

initTabs();
initAdd();
loadItems().catch((e) => console.error("csv load failed", e));
