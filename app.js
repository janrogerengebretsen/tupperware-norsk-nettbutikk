const state = {
  collections: [],
  activeGroup: null,
  activeCollection: "",
  query: "",
  sort: "featured",
  request: 0,
};

const els = {
  categoryNav: document.querySelector("#categoryNav"),
  categoryPanel: document.querySelector("#categoryPanel"),
  menuButton: document.querySelector("#menuButton"),
  closeMenuButton: document.querySelector("#closeMenuButton"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  homeButton: document.querySelector("#homeButton"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  mobileSearchForm: document.querySelector("#mobileSearchForm"),
  mobileSearchInput: document.querySelector("#mobileSearchInput"),
  pageTitle: document.querySelector("#pageTitle"),
  pageDescription: document.querySelector("#pageDescription"),
  subcategoryStrip: document.querySelector("#subcategoryStrip"),
  sortSelect: document.querySelector("#sortSelect"),
  resultCount: document.querySelector("#resultCount"),
  activeFilter: document.querySelector("#activeFilter"),
  productGrid: document.querySelector("#productGrid"),
  productDialog: document.querySelector("#productDialog"),
  dialogContent: document.querySelector("#dialogContent"),
  dialogClose: document.querySelector("#dialogClose"),
  toast: document.querySelector("#toast"),
};

const descriptions = {
  "": "Finn Tupperware-produktet som passer hverdagen din.",
  "special-sales": "Aktuelle tilbud og kampanjeprodukter samlet på ett sted.",
  conservation: "Smarte løsninger som holder maten organisert og frisk lenger.",
  preparation: "Redskaper og hjelpere for enklere, raskere matforberedelse.",
  "cooking-and-reheatable": "Produkter for tilberedning, oppvarming og gode resultater.",
  "serving-and-entertaining": "Praktiske og pene produkter til bord og servering.",
  "on-the-go": "Ta med mat og drikke trygt, ryddig og praktisk.",
  other: "Produkter til hjemmet, familien og flere bruksområder.",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function formatNok(value) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: Number(value) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function discountPercent(product) {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return 0;
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Kunne ikke hente butikkdata.");
  return payload;
}

function selectedGroup() {
  return state.collections.find(group => group.handle === state.activeGroup) || state.collections[0];
}

function renderNavigation() {
  els.categoryNav.innerHTML = state.collections.map((group, index) => {
    const open = group.handle === state.activeGroup;
    const active = state.activeCollection === group.handle || (!state.activeCollection && index === 0);
    if (!group.children.length) {
      return `
        <div class="nav-group">
          <button class="nav-main ${active ? "active" : ""}" data-collection="" data-group="">
            <span>${escapeHtml(group.title)}</span>
          </button>
        </div>`;
    }
    return `
      <div class="nav-group ${open ? "open" : ""}" data-nav-group="${escapeHtml(group.handle)}">
        <button class="nav-main ${active ? "active" : ""}" data-collection="${escapeHtml(group.handle)}" data-group="${escapeHtml(group.handle)}">
          <span>${escapeHtml(group.title)}</span>
          <i data-lucide="chevron-down"></i>
        </button>
        <div class="nav-children">
          ${group.children.map(child => `
            <button class="nav-child ${state.activeCollection === child.handle ? "active" : ""}"
              data-collection="${escapeHtml(child.handle)}"
              data-group="${escapeHtml(group.handle)}">${escapeHtml(child.title)}</button>
          `).join("")}
        </div>
      </div>`;
  }).join("");
  refreshIcons();
}

function renderSubcategories() {
  const group = selectedGroup();
  if (!group?.children?.length) {
    els.subcategoryStrip.innerHTML = "";
    return;
  }
  els.subcategoryStrip.innerHTML = [
    `<button class="subcategory ${state.activeCollection === group.handle ? "active" : ""}"
      data-collection="${escapeHtml(group.handle)}">${escapeHtml(group.title)}</button>`,
    ...group.children.map(child => `
      <button class="subcategory ${state.activeCollection === child.handle ? "active" : ""}"
        data-collection="${escapeHtml(child.handle)}">${escapeHtml(child.title)}</button>`),
  ].join("");
}

function updateHeading() {
  const group = selectedGroup();
  const child = group?.children?.find(item => item.handle === state.activeCollection);
  const title = state.query
    ? `Søkeresultater`
    : child?.title || group?.title || "Alle produkter";
  els.pageTitle.textContent = title;
  els.pageDescription.textContent = state.query
    ? `Produkter som passer søket «${state.query}».`
    : descriptions[group?.handle || ""] || "Utforsk den norske Tupperware-katalogen.";
  els.activeFilter.textContent = child ? `i ${group.title}` : "";
}

function productCard(product) {
  const discount = discountPercent(product);
  const isNew = product.tags.some(tag => tag.toLowerCase() === "new");
  return `
    <article class="product-card" data-handle="${escapeHtml(product.handle)}">
      <div class="product-badges">
        ${discount ? `<span class="badge sale">-${discount}%</span>` : ""}
        ${isNew ? `<span class="badge new">Nyhet</span>` : ""}
      </div>
      <button class="product-image" data-detail="${escapeHtml(product.handle)}" aria-label="Vis ${escapeHtml(product.title)}">
        ${product.image
          ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy">`
          : `<span class="image-placeholder"><i data-lucide="image"></i></span>`}
      </button>
      <div class="product-meta">
        <div class="stock ${product.available ? "" : "out"}">${product.available ? "På lager" : "Ikke på lager"}</div>
        <h2 class="product-title">${escapeHtml(product.title)}</h2>
        <div class="article-number">Art.nr. ${escapeHtml(product.articleNumber || "ikke oppgitt")}</div>
        <div class="price-row">
          <span class="price">${formatNok(product.price)}</span>
          ${product.compareAtPrice ? `<span class="compare-price">${formatNok(product.compareAtPrice)}</span>` : ""}
          ${discount ? `<span class="discount">Spar ${discount}%</span>` : ""}
        </div>
        <div class="product-actions">
          <button class="icon-button" data-detail="${escapeHtml(product.handle)}" aria-label="Vis produktdetaljer" title="Produktdetaljer">
            <i data-lucide="eye"></i>
          </button>
          <a class="shop-button" href="${escapeHtml(product.url)}" target="tupperware-shop" rel="noopener">
            Se i nettbutikken <i data-lucide="external-link"></i>
          </a>
        </div>
      </div>
    </article>`;
}

function renderLoading() {
  els.productGrid.innerHTML = Array.from({ length: 8 }, () => `<div class="product-skeleton"></div>`).join("");
  els.resultCount.textContent = "Laster produkter ...";
}

function renderEmpty() {
  els.productGrid.innerHTML = `
    <div class="empty-state">
      <i data-lucide="search-x"></i>
      <h2>Ingen produkter funnet</h2>
      <p>Prøv et kortere søkeord eller velg en annen kategori.</p>
    </div>`;
  refreshIcons();
}

function renderError(error) {
  els.productGrid.innerHTML = `
    <div class="error-state">
      <i data-lucide="wifi-off"></i>
      <h2>Kunne ikke hente produktene</h2>
      <p>${escapeHtml(error.message)}</p>
    </div>`;
  els.resultCount.textContent = "Butikkdata utilgjengelig";
  refreshIcons();
}

async function loadProducts() {
  const request = ++state.request;
  renderLoading();
  updateHeading();
  const params = new URLSearchParams({ sort: state.sort });
  if (state.activeCollection) params.set("collection", state.activeCollection);
  if (state.query) {
    params.delete("collection");
    params.set("q", state.query);
  }
  try {
    const payload = await fetchJson(`/api/products?${params}`);
    if (request !== state.request) return;
    els.resultCount.textContent = `${payload.count} ${payload.count === 1 ? "produkt" : "produkter"}`;
    if (!payload.products.length) return renderEmpty();
    els.productGrid.innerHTML = payload.products.map(productCard).join("");
    refreshIcons();
  } catch (error) {
    if (request === state.request) renderError(error);
  }
}

function chooseCollection(collection, group) {
  state.query = "";
  state.activeCollection = collection;
  state.activeGroup = group ?? collection;
  els.searchInput.value = "";
  els.mobileSearchInput.value = "";
  els.searchForm.classList.remove("has-value");
  renderNavigation();
  renderSubcategories();
  updateHeading();
  document.body.classList.remove("menu-open");
  loadProducts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function runSearch(value) {
  state.query = value.trim();
  els.searchInput.value = state.query;
  els.mobileSearchInput.value = state.query;
  els.searchForm.classList.toggle("has-value", Boolean(state.query));
  updateHeading();
  loadProducts();
}

function detailMarkup(product) {
  const discount = discountPercent(product);
  const images = product.images.length ? product.images : [""];
  return `
    <div class="detail-layout">
      <div class="detail-gallery">
        ${images[0]
          ? `<img class="detail-main-image" id="detailMainImage" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.title)}">`
          : `<div class="detail-main-image image-placeholder"><i data-lucide="image"></i></div>`}
        ${images.length > 1 ? `
          <div class="thumbnails">
            ${images.map((image, index) => `
              <button class="thumbnail ${index === 0 ? "active" : ""}" data-image="${escapeHtml(image)}" aria-label="Vis bilde ${index + 1}">
                <img src="${escapeHtml(image)}" alt="">
              </button>`).join("")}
          </div>` : ""}
      </div>
      <div class="detail-info">
        <div class="stock ${product.available ? "" : "out"}">${product.available ? "På lager" : "Ikke på lager"}</div>
        <h2>${escapeHtml(product.title)}</h2>
        <div class="article-number">Artikkelnummer ${escapeHtml(product.articleNumber || "ikke oppgitt")}</div>
        <div class="detail-price price-row">
          <span class="price">${formatNok(product.price)}</span>
          ${product.compareAtPrice ? `<span class="compare-price">${formatNok(product.compareAtPrice)}</span>` : ""}
          ${discount ? `<span class="discount">Spar ${discount}%</span>` : ""}
        </div>
        <p class="detail-description">${escapeHtml(product.description || "Produktbeskrivelse kommer fra Tupperwares norske produktside.")}</p>
        <div class="detail-actions">
          <a class="shop-button" href="${escapeHtml(product.url)}" target="tupperware-shop" rel="noopener">
            Åpne produktet hos Tupperware <i data-lucide="external-link"></i>
          </a>
          <button class="icon-button copy-link" data-copy="${escapeHtml(product.url)}" aria-label="Kopier produktlenke" title="Kopier produktlenke">
            <i data-lucide="link"></i>
          </button>
        </div>
        <div class="order-note">
          Du kan også sende meg en e-post for å bestille, så bestiller jeg for deg. Frakt kan tilkomme på billigst mulige måte. Produktet kan også finnes på lager i Norge og leveres raskere.
        </div>
      </div>
    </div>`;
}

async function openProduct(handle) {
  els.dialogContent.innerHTML = `<div class="detail-layout"><div class="product-skeleton"></div><div class="product-skeleton"></div></div>`;
  els.productDialog.showModal();
  try {
    const payload = await fetchJson(`/api/products/${encodeURIComponent(handle)}`);
    els.dialogContent.innerHTML = detailMarkup(payload.product);
    refreshIcons();
  } catch (error) {
    els.dialogContent.innerHTML = `<div class="error-state"><h2>Kunne ikke åpne produktet</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function init() {
  try {
    const payload = await fetchJson("/api/navigation");
    state.collections = payload.collections;
    state.activeGroup = "";
    renderNavigation();
    renderSubcategories();
    updateHeading();
    await loadProducts();
  } catch (error) {
    els.categoryNav.innerHTML = `<p>Kunne ikke laste kategoriene.</p>`;
    renderError(error);
  }
  refreshIcons();
}

els.categoryNav.addEventListener("click", event => {
  const button = event.target.closest("[data-collection]");
  if (!button) return;
  const collection = button.dataset.collection || "";
  const group = button.dataset.group ?? collection;
  if (group && state.activeGroup === group && collection === group) {
    const navGroup = button.closest(".nav-group");
    navGroup?.classList.toggle("open");
    if (state.activeCollection === collection) return;
  }
  chooseCollection(collection, group);
});

els.subcategoryStrip.addEventListener("click", event => {
  const button = event.target.closest("[data-collection]");
  if (button) chooseCollection(button.dataset.collection, state.activeGroup);
});

els.searchForm.addEventListener("submit", event => {
  event.preventDefault();
  runSearch(els.searchInput.value);
});

els.mobileSearchForm.addEventListener("submit", event => {
  event.preventDefault();
  runSearch(els.mobileSearchInput.value);
});

let searchTimer = 0;
els.searchInput.addEventListener("input", () => {
  els.searchForm.classList.toggle("has-value", Boolean(els.searchInput.value));
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => runSearch(els.searchInput.value), 350);
});

els.mobileSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => runSearch(els.mobileSearchInput.value), 350);
});

els.clearSearch.addEventListener("click", () => runSearch(""));
els.sortSelect.addEventListener("change", () => {
  state.sort = els.sortSelect.value;
  loadProducts();
});

els.homeButton.addEventListener("click", () => chooseCollection("", ""));
els.menuButton.addEventListener("click", () => document.body.classList.add("menu-open"));
els.closeMenuButton.addEventListener("click", () => document.body.classList.remove("menu-open"));
els.menuBackdrop.addEventListener("click", () => document.body.classList.remove("menu-open"));

els.productGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-detail]");
  if (button) openProduct(button.dataset.detail);
});

els.dialogClose.addEventListener("click", () => els.productDialog.close());
els.productDialog.addEventListener("click", event => {
  if (event.target === els.productDialog) els.productDialog.close();
});

els.dialogContent.addEventListener("click", async event => {
  const thumbnail = event.target.closest("[data-image]");
  if (thumbnail) {
    const main = document.querySelector("#detailMainImage");
    if (main) main.src = thumbnail.dataset.image;
    document.querySelectorAll(".thumbnail").forEach(item => item.classList.toggle("active", item === thumbnail));
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copy);
    showToast("Produktlenken er kopiert.");
  }
});

init();
