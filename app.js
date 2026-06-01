// ============================================================
// APP.JS — UI Logic & Rendering (v2.0)
// ============================================================

let currentResult = null;
let calcTimeout = null;

// ══════════════════════════════════════════════
// NUMBER INPUT FORMATTING (thousand separators)
// ══════════════════════════════════════════════
/** Parse a formatted string like "30.000" → 30000 */
function parseFmtNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/\./g, '').replace(/,/g, '.')) || 0;
}

/** Format a number into Vietnamese thousand-separator string: 30000 → "30.000" */
function fmtInput(n) {
  if (n == null || isNaN(n) || n === 0) return '';
  // Handle decimals: only format the integer part
  const str = String(n);
  const parts = str.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? intPart + ',' + parts[1] : intPart;
}

/** Setup live formatting for all inputs with data-fmt="number" */
function setupFmtInputs() {
  document.querySelectorAll('[data-fmt="number"]').forEach(el => {
    el.addEventListener('input', () => {
      const val = el.value;
      // Allow empty
      if (val === '') return;
      // Don't interrupt while typing a separator (e.g. "30." user may continue)
      if (val.endsWith('.') || val.endsWith(',')) return;
      const raw = parseFmtNumber(val);
      // If raw is 0 and user typed something non-empty, let them continue typing
      if (raw === 0 && val.replace(/[.,]/g, '') === '') return;
      if (raw === 0) return; // allow clearing
      const cursorPos = el.selectionStart;
      const oldLen = val.length;
      const formatted = fmtInput(raw);
      if (formatted === val) return; // no change needed
      el.value = formatted;
      // Adjust cursor position after formatting
      const diff = formatted.length - oldLen;
      el.setSelectionRange(cursorPos + diff, cursorPos + diff);
    });
    el.addEventListener('focus', () => {
      // Select all on focus for easy overwrite
      setTimeout(() => el.select(), 50);
    });
  });
}

// dotFmt, parseDotFmt, fmtCfgInput — defined fully in the Config section below


/** Set a formatted input's value programmatically */
function setFmtValue(id, num) {
  const el = document.getElementById(id);
  if (el && el.dataset.fmt === 'number') {
    el.value = fmtInput(num);
  } else if (el) {
    el.value = num;
  }
}

/** Get raw number from a formatted input */
function getFmtValue(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback || 0;
  if (el.dataset.fmt === 'number') {
    const v = parseFmtNumber(el.value);
    return v || fallback || 0;
  }
  return parseFloat(el.value) || fallback || 0;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  populateDropdowns();
  loadMaterialConfig();     // Restore Cơ Số SX from localStorage
  resetForm();              // Clear all input fields on page load
  renderHistory();
  setupAutoCalc();
  setupFmtInputs();
  updateStructurePreview();
  updateCylinderPreview();
  loadDisplayPreferences();

  // Validate order info on text input changes
  document.getElementById('customer').addEventListener('input', validateOrderInfo);
  document.getElementById('productName').addEventListener('input', validateOrderInfo);
  validateOrderInfo();
});

// ══════════════════════════════════════════════
// DISPLAY PREFERENCES (Theme, Layout, Density)
// ══════════════════════════════════════════════
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('lts_theme', newTheme);
  showToast(newTheme === 'dark' ? '🌙 Chế độ tối' : '☀️ Chế độ sáng', 'info');
}

function setLayout(layout) {
  document.documentElement.setAttribute('data-layout', layout);
  localStorage.setItem('lts_layout', layout);
  document.querySelectorAll('#layoutToolbar .toolbar-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.layout === layout)
  );
  if (layout === 'bento' && currentResult) {
    switchView('bento');
  } else if (layout !== 'bento') {
    const activeView = document.querySelector('.tab.active')?.dataset.view;
    if (activeView === 'bento') switchView('sale');
  }
}

function setDensity(density) {
  document.documentElement.setAttribute('data-density', density);
  localStorage.setItem('lts_density', density);
  document.querySelectorAll('#densityToolbar .toolbar-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.density === density)
  );
}

function toggleAdvanced() {
  const section = document.getElementById('advancedSection');
  const arrow = document.getElementById('advancedArrow');
  const isOpen = section.classList.toggle('open');
  arrow.classList.toggle('open', isOpen);
  localStorage.setItem('lts_advanced_open', isOpen ? '1' : '0');
}

// ══════════════════════════════════════════════
// COLLAPSIBLE RESULT CARDS
// ══════════════════════════════════════════════
/**
 * Gắn mũi tên thu/mở vào mọi .card trong #resultArea.
 * Gọi sau khi render kết quả xong.
 * Lưu trạng thái (open/collapsed) vào localStorage theo card-id (data-card-id).
 */
function initCollapsibleCards() {
  const resultArea = document.getElementById('resultArea');
  if (!resultArea) return;

  resultArea.querySelectorAll('.card').forEach((card, idx) => {
    // Bỏ qua card đang ẩn — chúng được ẩn theo thiết kế, không cần collapsible
    if (card.style.display === 'none') return;
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return;



    // Nếu đã xử lý rồi → tự đóng lại khi tính toán mới
    if (titleEl.classList.contains('collapsible')) {
      const body = card.querySelector(':scope > .card-body-collapsible');
      const arrow = titleEl.querySelector('.card-collapse-arrow');
      if (body) body.classList.remove('open');
      if (arrow) arrow.classList.remove('open');
      return;
    }

    // Thêm class collapsible vào title
    titleEl.classList.add('collapsible');

    // Tạo mũi tên (SVG tam giác đều có trọng tâm tại giữa viewBox để xoay không bị lệch)
    const arrow = document.createElement('span');
    arrow.className = 'card-collapse-arrow';
    arrow.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5.072,8 18.928,8 12,20"/></svg>';
    titleEl.appendChild(arrow);

    // Bọc tất cả nội dung sau title vào wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'card-body-collapsible';

    // Lấy tất cả sibling nodes sau title-el và đưa vào wrapper
    const siblings = [];
    let next = titleEl.nextSibling;
    while (next) {
      siblings.push(next);
      next = next.nextSibling;
    }
    siblings.forEach(s => wrapper.appendChild(s));
    card.appendChild(wrapper);

    // Mặc định: đóng. Click để mở/đóng — không lưu localStorage
    titleEl.addEventListener('click', () => {
      const isNowOpen = wrapper.classList.toggle('open');
      arrow.classList.toggle('open', isNowOpen);
    });
  });
}

function loadDisplayPreferences() {
  const theme = localStorage.getItem('lts_theme') || 'light';
  const layout = localStorage.getItem('lts_layout') || 'default';
  const density = localStorage.getItem('lts_density') || 'comfortable';

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-layout', layout);
  document.documentElement.setAttribute('data-density', density);

  document.querySelectorAll('#layoutToolbar .toolbar-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.layout === layout)
  );
  document.querySelectorAll('#densityToolbar .toolbar-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.density === density)
  );

  // Restore advanced panel state
  if (localStorage.getItem('lts_advanced_open') === '1') {
    document.getElementById('advancedSection')?.classList.add('open');
    document.getElementById('advancedArrow')?.classList.add('open');
  }
}

// resetForm — defined fully later in the file

// ══════════════════════════════════════════════
// TOAST NOTIFICATION
// ══════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4200);
}

// ══════════════════════════════════════════════
// PRODUCT TYPE HANDLERS
// ══════════════════════════════════════════════
function handleProductType() {
  const type = document.getElementById('productType').value;
  const bagGroup = document.getElementById('bagTypeGroup');
  const filmGroup = document.getElementById('filmTypeGroup');
  const structSection = document.getElementById('structureSection');

  // Reset sub-type selections
  document.getElementById('bagType').value = '';
  document.getElementById('filmType').value = '';

  // Show/hide sub-type dropdowns
  bagGroup.style.display = type === 'tui' ? 'block' : 'none';
  filmGroup.style.display = type === 'mang' ? 'block' : 'none';

  // Hide structure until sub-type is selected
  structSection.style.display = 'none';
  validateOrderInfo();
}

function handleSubType() {
  const type = document.getElementById('productType').value;
  const structSection = document.getElementById('structureSection');

  let subVal = '';
  if (type === 'tui') {
    subVal = document.getElementById('bagType').value;
  } else if (type === 'mang') {
    subVal = document.getElementById('filmType').value;
  }

  // Show structure section when a sub-type is selected
  if (subVal) {
    structSection.style.display = 'block';
    // Re-trigger auto-calc setup for newly visible elements
    setupAutoCalc();
  } else {
    structSection.style.display = 'none';
  }
  validateOrderInfo();
}

// ══════════════════════════════════════════════
// ORDER VALIDATION — enable/disable Tính Giá
// ══════════════════════════════════════════════
function isOrderInfoComplete() {
  const productType = document.getElementById('productType').value;
  const qty = getFmtValue('quantity', 0);
  const spreadWidth = parseFloat(document.getElementById('spreadWidth').value) || 0;
  const cutStep = parseFloat(document.getElementById('cutStep').value) || 0;
  const numColors = document.getElementById('numColors').value;

  if (!productType || qty <= 0 || spreadWidth <= 0 || cutStep <= 0 || numColors === '') return false;

  // Check sub-type based on product type
  if (productType === 'tui') {
    return !!document.getElementById('bagType').value;
  } else if (productType === 'mang') {
    return !!document.getElementById('filmType').value;
  }
  return false;
}

function validateOrderInfo() {
  const btn = document.getElementById('btnCalculate');
  if (!btn) return;
  // Always keep the button enabled as per user request
  btn.disabled = false;
}

// ══════════════════════════════════════════════
// DROPDOWNS
// ══════════════════════════════════════════════
function populateDropdowns() {
  const layerSelects = [1, 2, 3, 4, 5].map(i => document.getElementById('layer' + i));
  const layer1OnlyGroups = ['BOPP', 'Matt OPP'];

  const groups = {};
  const flatOptions = [];

  MATERIALS.forEach(m => {
    if (m.group) {
      if (!groups[m.group]) groups[m.group] = [];
      groups[m.group].push(m);
    } else {
      flatOptions.push(m);
    }
  });

  layerSelects.forEach((select, index) => {
    if (!select) return;
    select.innerHTML = '<option value="">— Chọn —</option>';
    
    flatOptions.forEach(m => {
      select.innerHTML += `<option value="${m.id}">${m.name}</option>`;
    });

    Object.keys(groups).forEach(g => {
      if (index === 0 || !layer1OnlyGroups.includes(g)) {
        select.innerHTML += `<option value="GROUP_${g}">${g}</option>`;
      }
    });

    select.addEventListener('change', () => handleLayerChange(index + 1));
  });

  [1, 2, 3, 4, 5].forEach(i => {
    const selectMic = document.getElementById('micSelect' + i);
    if(selectMic) {
      selectMic.addEventListener('change', () => {
         updateStructurePreview();
      });
    }
    handleLayerChange(i); // init
  });
}

function handleLayerChange(layerNum) {
  const select = document.getElementById('layer' + layerNum);
  if (!select) return;
  const micAdjust = document.getElementById('micAdjust' + layerNum);
  const micInput = document.getElementById('micLayer' + layerNum);
  const micSelect = document.getElementById('micSelect' + layerNum);
  const val = select.value;

  if (val && val.startsWith('GROUP_')) {
    const groupName = val.replace('GROUP_', '');
    const groupItems = MATERIALS.filter(m => m.group === groupName);
    
    if(micAdjust) micAdjust.style.display = 'block';
    if(micInput) micInput.style.display = 'none';
    if(micSelect) {
      micSelect.style.display = 'block';
      micSelect.innerHTML = groupItems.map(m => `<option value="${m.id}">${m.thickness}</option>`).join('');
    }
  } else {
    const mat = val ? getMaterial(val) : null;
    if (mat && mat.adjustableMic) {
      if(micAdjust) micAdjust.style.display = 'block';
      if(micInput) {
        micInput.style.display = 'block';
        micInput.value = mat.thickness;
      }
      if(micSelect) micSelect.style.display = 'none';
    } else {
      if(micAdjust) micAdjust.style.display = 'none';
      if(micInput) {
        micInput.style.display = 'none';
        micInput.value = '';
      }
      if(micSelect) micSelect.style.display = 'none';
    }
  }

  // ── Ràng buộc thứ tự: lớp N+1 chỉ được bật khi lớp N đã chọn ──
  if (layerNum >= 1 && layerNum <= 4) {
    const nextSelect = document.getElementById('layer' + (layerNum + 1));
    if (nextSelect) {
      if (!val) {
        // Cascade: tắt và xóa tất cả lớp phía sau
        for (let i = layerNum + 1; i <= 5; i++) {
          const s = document.getElementById('layer' + i);
          if (!s) continue;
          s.value = '';
          s.disabled = true;
          const ma = document.getElementById('micAdjust' + i);
          if (ma) ma.style.display = 'none';
          const mi = document.getElementById('micLayer' + i);
          if (mi) { mi.style.display = 'none'; mi.value = ''; }
          const ms = document.getElementById('micSelect' + i);
          if (ms) ms.style.display = 'none';
        }
      } else {
        nextSelect.disabled = false;
      }
    }
  }
}

// ══════════════════════════════════════════════
// AUTO CALCULATE
// ══════════════════════════════════════════════
function setupAutoCalc() {
  document.querySelectorAll('.calc-trigger').forEach(el => {
    const event = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(event, () => {
      clearTimeout(calcTimeout);
      calcTimeout = setTimeout(() => {
        updateStructurePreview();
        updateCylinderPreview();
        doCalculate(true);
      }, 300);
    });
  });
  // Setup segmented option groups
  setupOptionGroups();
}

function setupOptionGroups() {
  document.querySelectorAll('.option-group').forEach(group => {
    group.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        clearTimeout(calcTimeout);
        calcTimeout = setTimeout(() => doCalculate(true), 100);
      });
    });
  });
}

function autoCalcCylinder() {
  const spreadWidth = parseFloat(document.getElementById('spreadWidth').value);
  const cutStep = parseFloat(document.getElementById('cutStep').value);
  
  let n = parseInt(document.getElementById('numImages').value);
  if (isNaN(n) || n <= 0) {
    n = 1;
  }
  
  if (!isNaN(spreadWidth) && spreadWidth > 0) {
    // base = KT × SCH (số con hình) → rồi nhân thêm nCalc cho đến khi base*nCalc + 0.1 >= 0.7
    const base = spreadWidth * n;
    let nCalc = 1;
    while (base * nCalc + 0.1 < 0.7) {
      nCalc++;
    }
    const calcLength = base * nCalc + 0.1;
    document.getElementById('cylLength').value = +calcLength.toFixed(3);
  } else {
    document.getElementById('cylLength').value = '';
  }
  
  if (!isNaN(cutStep) && cutStep > 0) {
    let N = 1;
    while (cutStep * N < 0.4) {
      N++;
    }
    document.getElementById('cylCircum').value = +(cutStep * N).toFixed(3);
  } else {
    document.getElementById('cylCircum').value = '';
  }
  
  updateCylinderPreview();
  checkCylinderBounds(); // Gọi check notice
}

function checkCylinderBounds() {
  const l = parseFloat(document.getElementById('cylLength').value);
  const lNotice = document.getElementById('cylLengthNotice');
  if (lNotice) {
    if (!isNaN(l)) {
      if (l < 0.7) {
        lNotice.textContent = '⚠️ Dưới tối thiểu (0.7m)';
        lNotice.style.display = 'block';
      } else if (l > 1.25) {
        lNotice.textContent = '⚠️ Vượt tối đa (1.25m)';
        lNotice.style.display = 'block';
      } else {
        lNotice.style.display = 'none';
      }
    } else {
      lNotice.style.display = 'none';
    }
  }

  const c = parseFloat(document.getElementById('cylCircum').value);
  const cNotice = document.getElementById('cylCircumNotice');
  if (cNotice) {
    if (!isNaN(c)) {
      if (c < 0.4) {
        cNotice.textContent = '⚠️ Dưới tối thiểu (0.4m)';
        cNotice.style.display = 'block';
      } else if (c > 0.9) {
        cNotice.textContent = '⚠️ Vượt tối đa (0.9m)';
        cNotice.style.display = 'block';
      } else {
        cNotice.style.display = 'none';
      }
    } else {
      cNotice.style.display = 'none';
    }
  }
}

// ══════════════════════════════════════════════
// STRUCTURE VISUAL PREVIEW
// ══════════════════════════════════════════════
function getActualLayerId(layerNum) {
  const select = document.getElementById('layer' + layerNum);
  if (!select) return null;
  const val = select.value;
  if (!val) return null;
  if (val.startsWith('GROUP_')) {
    const micSelect = document.getElementById('micSelect' + layerNum);
    return micSelect && micSelect.style.display !== 'none' ? micSelect.value : null;
  }
  return val;
}

function updateStructurePreview() {
  const layers = [1, 2, 3, 4, 5].map(i => {
    const id = getActualLayerId(i);
    const mat = id ? getMaterial(id) : null;
    const micInput = document.getElementById('micLayer' + i);
    const customMic = (micInput && micInput.style.display !== 'none' && micInput.value) ? parseInt(micInput.value) : null;
    return { mat, customMic, num: i };
  });

  const preview = document.getElementById('structurePreview');
  const activeLayers = layers.filter(l => l.mat);

  if (activeLayers.length === 0) {
    preview.innerHTML = '<div class="layer" style="background:linear-gradient(135deg,#94a3b8,#cbd5e1);opacity:0.35"><div class="layer-name">—</div><div class="layer-thickness">Chưa chọn lớp</div></div>';
    return;
  }

  preview.innerHTML = activeLayers.map(l => {
    const mic = (l.mat.adjustableMic && l.customMic) ? l.customMic : l.mat.thickness;
    return `<div class="layer"><div class="layer-name">${l.mat.name.split(' ')[0]}</div><div class="layer-thickness">${mic}mic</div></div>`;
  }).join('');
}

// ══════════════════════════════════════════════
// VIEW SWITCH
// ══════════════════════════════════════════════
function switchView(view) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  const mainContainer = document.querySelector('.container');
  const configPage = document.getElementById('configPage');

  if (view === 'config') {
    document.documentElement.classList.add('in-config-page');
    // Hide main content, show config page
    if (mainContainer) mainContainer.style.display = 'none';
    if (configPage) { configPage.style.display = ''; renderMaterialPriceTable(); renderInkPriceTable(); renderPrintWasteTable(); populateCPSXInputs(); renderProfitTable(); }
  } else {
    document.documentElement.classList.remove('in-config-page');
    // Show main content, hide config page
    if (mainContainer) mainContainer.style.display = '';
    if (configPage) { configPage.style.display = 'none'; saveMaterialConfig(); }
    const panel = document.getElementById('panel-' + view);
    if (panel) panel.classList.add('active');
  }

  if (view === 'history') renderHistory();
  if (view === 'moq' && currentResult) renderMOQView(currentResult);
  if (view === 'bento' && currentResult) renderBentoView(currentResult);
}

// ══════════════════════════════════════════════
// INPUT GATHERING
// ══════════════════════════════════════════════
function gatherInput() {
  // Collect custom mic overrides
  const micOverrides = {};
  [1, 2, 3, 4, 5].forEach(i => {
    const micInput = document.getElementById('micLayer' + i);
    if (micInput && micInput.style.display !== 'none' && micInput.value) {
      micOverrides['layer' + i] = parseInt(micInput.value);
    }
  });

  const selectedPaymentTerm = document.querySelector('input[name="paymentTerm"]:checked')?.value || '30';
  const paymentRateInput = document.getElementById('pt_rate_' + selectedPaymentTerm);
  const paymentInterestRate = paymentRateInput ? parseFloat(paymentRateInput.value) / 100 : 0.0025;

  const selCutStep = parseFloat(document.getElementById('cutStep').value) || 0;
  let nImages = parseInt(document.getElementById('numImages').value);
  if (isNaN(nImages) || nImages <= 0) {
    nImages = 1; // Mặc định là 1, bỏ tự động nhân theo bước cắt
  }

  const layer1Id = getActualLayerId(1);
  const layer2Id = getActualLayerId(2);
  const layer3Id = getActualLayerId(3);
  const layer4Id = getActualLayerId(4);
  const layer5Id = getActualLayerId(5);
  const bagType = document.getElementById('bagType').value || '';
  const hasZipper = document.getElementById('hasZipper')?.checked || false;

  const activeLayers = [layer1Id, layer2Id, layer3Id, layer4Id, layer5Id].filter(id => id && id.length > 0);
  const numLayers = activeLayers.length;
  const hasMPETorAL = activeLayers.some(id => {
    const upper = id.toUpperCase();
    return upper.includes('MPET') || upper.includes('AL');
  });
  
  const computedProfitColumn = (numLayers >= 3 || hasMPETorAL || bagType === 'dayDung' || hasZipper) ? 2 : 1;

  return {
    customer: document.getElementById('customer').value || 'N/A',
    productName: document.getElementById('productName').value || 'N/A',
    productType: document.getElementById('productType').value || '',
    bagType: bagType,
    filmType: document.getElementById('filmType').value || '',
    quantity: getFmtValue('quantity', 0),
    numColors: parseInt(document.getElementById('numColors').value) || 0,
    numImages: nImages,
    layer1Id: layer1Id,
    layer2Id: layer2Id,
    layer3Id: layer3Id,
    layer4Id: layer4Id,
    layer5Id: layer5Id,
    spreadWidth: parseFloat(document.getElementById('spreadWidth').value) || 0,
    cutStep: parseFloat(document.getElementById('cutStep').value) || 0,
    metallicSurcharge: (document.getElementById('hasNhu').checked ? CONSTANTS.nhuPrice : 0)
      + (document.getElementById('hasMo').checked ? CONSTANTS.moPrice : 0),
    coverageRatio: (parseFloat(document.getElementById('coverage').value) || 100) / 100,
    handleWeight: document.getElementById('hasHandle')?.checked ? CONSTANTS.handleWeight : 0,
    zipperWeight: document.getElementById('hasZipper')?.checked ? CONSTANTS.zipperWeight : 0,
    tapeWeight: document.getElementById('hasTape')?.checked ? CONSTANTS.tapeWeight : 0,
    hasZipper: hasZipper,
    hasTape: document.getElementById('hasTape')?.checked || false,
    hasHandle: document.getElementById('hasHandle')?.checked || false,
    paymentDays: parseInt(selectedPaymentTerm),
    paymentInterestRate: paymentInterestRate,
    profitColumn: computedProfitColumn,
    commissionRate: document.getElementById('commissionUnit').value === 'percent'
      ? (parseFloat(document.getElementById('commission').value) || 0) / 100 : 0,
    commissionFixedVND: document.getElementById('commissionUnit').value === 'vnd'
      ? (parseFloat(document.getElementById('commission').value) || 0) : 0,
    commissionUnit: document.getElementById('commissionUnit').value,
    commissionInputValue: parseFloat(document.getElementById('commission').value) || 0,
    bagsPerBox: getFmtValue('bagsPerBox', 0),
    boxPrice: getFmtValue('boxPrice', 0),
    shippingPerKm: getFmtValue('shippingPerKm', 0),
    shippingKm: parseInt(document.getElementById('shippingKm').value) || 0,
    cylLength: parseFloat(document.getElementById('cylLength').value) || 0,
    cylCircum: parseFloat(document.getElementById('cylCircum').value) || 0,
    cylUnitPrice: getFmtValue('cylUnitPrice', 0),
    micOverrides,
  };
}

// ══════════════════════════════════════════════
// CALCULATE
// ══════════════════════════════════════════════
function doCalculate(silent = false) {
  // Block calculation if order info is incomplete
  if (!isOrderInfoComplete()) {
    if (!silent) showToast('Vui lòng nhập đầy đủ Thông tin đơn hàng trước.', 'error');
    return;
  }
  const input = gatherInput();
  
  if (input.cylUnitPrice > 0 && input.cylUnitPrice !== CONSTANTS.cylinderPricePerUnit) {
    CONSTANTS.cylinderPricePerUnit = input.cylUnitPrice;
    saveMaterialConfig();
  }

  currentResult = calculate(input);
  if (!currentResult) {
    if (!silent) showToast('Vui lòng chọn đầy đủ lớp màng.', 'error');
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  renderSaleView(currentResult);
  renderManagerView(currentResult);
  renderTechView(currentResult);
  renderMOQView(currentResult); // always render MOQ now since it is part of Manager view
  renderQuoteView(currentResult);

  // Gắn mũi tên thu/mở cho các card trong vùng kết quả
  setTimeout(() => initCollapsibleCards(), 0);

  const activeTab = document.querySelector('.tab.active');
  const view = activeTab ? activeTab.dataset.view : 'manager';
  const layout = document.documentElement.getAttribute('data-layout');

  if (layout === 'bento') {
    renderBentoView(currentResult);
    switchView('bento');
  } else if (view === 'history') {
    switchView('manager');
  } else {
    switchView(view);
  }

  if (!silent) {
    saveHistory({
      customer: input.customer,
      productName: input.productName,
      structure: currentResult.structureText,
      quantity: input.quantity,
      finalPrice: currentResult.finalPrice,
      input: input,
    });
    showToast(`Giá đề xuất: ${fmt(currentResult.finalPrice, 0)} đ/túi`, 'success');
  }
}

// ══════════════════════════════════════════════
// SALE VIEW RENDER
// ══════════════════════════════════════════════
function renderSaleView(r) {
  document.getElementById('s-price').textContent = fmt(r.finalPrice, 0);
  const numColorsText = r.input.numColors > 0 ? `${r.input.numColors} màu` : 'Không in';
  const spreadMm = +(r.input.spreadWidth * 1000).toFixed(0);
  const cutMm = +(r.input.cutStep * 1000).toFixed(0);
  
  const bagMap = {
    '3bien': '3 biên', '4bien': '4 biên', 'xephong_lech': 'Xếp hông dán lưng lệch',
    'xephong_giua': 'Xếp hông dán lưng giữa', 'dayDung': 'Đáy đứng', 'cutSeal': 'Cut seal'
  };
  let bagStr = bagMap[r.input.bagType] || '';
  if (r.input.productType === 'tui' && bagStr) {
    if (r.input.hasZipper) {
      if (r.input.bagType === 'cutSeal') {
        bagStr = 'Cute seal nắp băng keo';
      } else {
        bagStr = 'Zipper ' + bagStr;
      }
    }
  } else if (r.input.productType === 'mang') {
    bagStr = 'Màng cuộn';
  }

  const cylPerUnit = r.cylinderCostPerUnit;
  const numTr = r.input.numColors || 0;
  const cylTotal = r.cylinderCost;

  let cylinderInfoStr = '';
  if (numTr > 0) {
    cylinderInfoStr = `<div><strong>Trục in:</strong> D ${fmt(r.cylLength * 1000)} mm x CV ${fmt(r.cylCircum * 1000)} mm - ${fmt(cylPerUnit)} đ/trục * ${numTr} trục = ${fmt(cylTotal)} đ</div>`;
  }

  document.getElementById('s-structure').innerHTML = `
    <div style="font-weight:600; color:var(--text); font-size:1.05rem; margin-bottom:12px;">${r.input.customer} — ${r.input.productName}</div>
    <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 20px; font-size:0.9rem; margin:0 auto; max-width:600px;">
      <div><strong>Chất liệu:</strong> ${r.structureText}</div>
      <div><strong>Số lượng:</strong> ${fmt(r.input.quantity)} túi</div>
      <div><strong>Số màu:</strong> ${numColorsText}</div>
      <div><strong>Kích thước:</strong> KT ${spreadMm} mm x BC ${cutMm} mm</div>
      <div><strong>Độ dày:</strong> ${r.totalThickness} mic</div>
      <div><strong>Diện tích:</strong> ${fmtM2(r.bagArea)}</div>
      <div><strong>Trọng lượng:</strong> ${fmt(r.tareWeight, 2)} gr</div>
      <div><strong>Loại ${r.input.productType === 'mang' ? 'sản phẩm' : 'túi'}:</strong> ${bagStr}</div>
      ${cylinderInfoStr}
    </div>
  `;

  const totalCommission = r.commissionPerUnit * r.input.quantity;
  const commissionPct = r.costPerUnit > 0 ? (r.commissionPerUnit / r.costPerUnit) : 0;

  document.getElementById('s-stats').innerHTML = `
    <div class="stat-card green" style="position:relative"><div class="stat-label">Lợi Nhuận</div><div class="stat-value" style="font-size:1.15rem">${fmt(r.profitAmount)}đ <span style="font-size:0.85rem">(${fmtPercent(r.profitRate)})</span></div><div id="s-profit-card-notice"></div></div>
    <div class="stat-card cyan"><div class="stat-label">Doanh thu túi</div><div class="stat-value">${fmt(r.revenue)} đ</div></div>
    <div class="stat-card orange"><div class="stat-label">Giá Bán/Túi</div><div class="stat-value">${fmt(r.finalPrice, 0)} đ</div></div>
    <div class="stat-card pink"><div class="stat-label">Hoa hồng</div><div class="stat-value" style="font-size:1.15rem">${fmt(totalCommission)} đ <div style="font-size:0.85rem; font-weight:normal; margin-top:4px;">${fmt(r.commissionPerUnit, 1)} đ/túi (${fmtPercent(commissionPct)})</div></div></div>
  `;



  const items = [
    [`Giá ban đầu (Vốn + ${fmtPercent(r.profitRate)} LN)`, fmt(r.costPerUnit, 1) + ' đ'],
  ];
  if (r.input.hasZipper) items.push(['Chi phí Zipper', fmt(r.zipperPerUnit, 1) + ' đ']);
  if (r.input.hasTape) items.push(['Chi phí Băng keo', fmt(r.tapePerUnit, 1) + ' đ']);
  if (r.input.hasHandle) items.push(['Chi phí Quai', fmt(r.handlePerUnit, 1) + ' đ']);
  
  items.push(
    ['Chi phí Thùng giấy', fmt(r.boxPerUnit, 1) + ' đ'],
    ['Chi phí Vận chuyển', fmt(r.shippingPerUnit, 1) + ' đ'],
    [`Lãi vay vốn (${fmtPercent(r.interestRate30)})`, fmt(r.interestPerUnit, 1) + ' đ'],
    ['Hoa hồng kinh doanh', fmt(r.commissionPerUnit, 1) + ' đ']
  );
  document.getElementById('s-breakdown').innerHTML = items.map(([l, v]) =>
    `<li><span class="bl-label">${l}</span><span class="bl-value">${v}</span></li>`
  ).join('') + `<li class="bl-total"><span class="bl-label" style="color:var(--orange)">GIÁ BÁN ĐỀ XUẤT / TÚI</span><span class="bl-value" style="color:var(--orange)">${fmt(r.finalPrice, 0)} đ</span></li>`;

  const orderInfoEl = document.getElementById('s-order-info');
  if (orderInfoEl) {
    // Hide the 'Thông tin đơn hàng' card since we moved everything to the top header
    const cardEl = orderInfoEl.closest('.card');
    if (cardEl) cardEl.style.display = 'none';
  }

  const hintEl = document.getElementById('profitRateHint');
  if (hintEl) {
    hintEl.textContent = `(Ước tính: ${fmtPercent(r.defaultProfitRate)})`;
  }

  analyzeChotGia();
  updateCommissionHint();
  updateCylinderPreview();
}

// ══════════════════════════════════════════════
// COMMISSION HINT — Show conversion between % ↔ VND
// ══════════════════════════════════════════════
function updateCommissionHint() {
  const hint = document.getElementById('commissionHint');
  if (!currentResult || !hint) { if (hint) hint.textContent = ''; return; }

  const unit = document.getElementById('commissionUnit').value;
  const val = parseFloat(document.getElementById('commission').value) || 0;
  if (val === 0) { hint.textContent = ''; return; }

  const r = currentResult;
  if (unit === 'percent') {
    // Input is %, show equivalent VND/túi
    const vndPerUnit = (val / 100) * r.costPerUnit;
    hint.textContent = `= ${fmt(vndPerUnit, 1)} đ/túi`;
  } else {
    // Input is VND, show equivalent %
    const pct = r.costPerUnit > 0 ? (val / r.costPerUnit * 100) : 0;
    hint.textContent = `= ${pct.toFixed(2)}% (trên giá vốn+LN)`;
  }
}

// ══════════════════════════════════════════════
// CYLINDER PREVIEW — live cost preview
// ══════════════════════════════════════════════
function updateCylinderPreview() {
  const el = document.getElementById('cylinderPreview');
  if (!el) return;
  const L = parseFloat(document.getElementById('cylLength').value) || 0;
  const C = parseFloat(document.getElementById('cylCircum').value) || 0;
  const P = getFmtValue('cylUnitPrice', 7300000);
  const numColors = parseInt(document.getElementById('numColors').value) || 4;
  const area = L * C;
  const perCyl = area * P;
  const total = perCyl * numColors;
  el.innerHTML = `DT: <span class="cyl-val">${(area).toFixed(4)} m²</span> · `
    + `1 trục: <span class="cyl-val">${fmt(perCyl, 0)} đ</span> · `
    + `Cả bộ (${numColors} màu): <span class="cyl-val">${fmt(total, 0)} đ</span>`;
}

// ══════════════════════════════════════════════
// MANAGER VIEW RENDER
// ══════════════════════════════════════════════
function renderManagerView(r) {
  const total = r.totalProductionCost;
  document.getElementById('m-stats').innerHTML = ``;

  const pIn = r.printTotalCost / total * 100;
  const pLam = r.totalLamCost / total * 100;
  const pCut = r.cutTotalCost / total * 100;
  document.getElementById('m-costbar').innerHTML = `
    <div class="segment seg-print" style="width:${pIn}%">${pIn.toFixed(0)}%</div>
    <div class="segment seg-lam" style="width:${pLam}%">${pLam.toFixed(0)}%</div>
    <div class="segment seg-cut" style="width:${pCut}%">${pCut.toFixed(0)}%</div>
  `;
  document.getElementById('m-legend').innerHTML = `
    <div class="legend-item"><div class="dot" style="background:var(--accent)"></div>In: ${fmt(r.printTotalCost / 1000000, 2)}tr</div>
    <div class="legend-item"><div class="dot" style="background:var(--accent2)"></div>Ghép: ${fmt(r.totalLamCost / 1000000, 2)}tr</div>
    <div class="legend-item"><div class="dot" style="background:var(--orange)"></div>Cắt: ${fmt(r.cutTotalCost / 1000000, 2)}tr</div>
  `;

  const rows = [
    ['CPSX IN', r.layers.print.material.name, fmt(r.printCostCPSX), fmt(r.printCostMaterial), fmt(r.printTotalCost)],
  ];
  if (r.layers.laminations) {
    r.layers.laminations.forEach(lam => {
      rows.push([`GHÉP (Lớp ${lam.layerNum})`, lam.material.name, fmt(lam.costCPSX), fmt(lam.costMat), fmt(lam.total)]);
    });
  }
  rows.push(['CPSX CẮT', '—', fmt(r.cutCostCPSX), '0', fmt(r.cutTotalCost)]);

  document.getElementById('m-cost-table').innerHTML = `
    <tr><th>Công đoạn</th><th>Màng</th><th class="num">Chi phí SX</th><th class="num">Chi phí Màng</th><th class="num">Tổng</th></tr>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td><td class="num highlight">${r[4]}</td></tr>`).join('')}
    <tr class="total-row"><td colspan="4">TỔNG GIÁ VỐN SẢN XUẤT</td><td class="num">${fmt(total)}</td></tr>
  `;

  document.getElementById('m-profit').innerHTML = [
    ['Tổng giá vốn SX', fmtVND(total)],
    [(r.input.customProfitRate >= 0 ? 'Tỷ lệ LN (Tùy chỉnh)' : 'Tỷ lệ LN (Ước tính)'), fmtPercent(r.profitRate)],
    ['Số tiền LN', fmtVND(r.profitAmount)],
    ['Doanh thu (GV + LN)', fmtVND(r.revenue)],
    ['Giá vốn+LN / túi', fmtVND(r.costPerUnit)],
  ].map(([l, v]) => `<li><span class="bl-label">${l}</span><span class="bl-value">${v}</span></li>`).join('')
    + `<li class="bl-total"><span class="bl-label">GIÁ BÁN / TÚI</span><span class="bl-value">${fmtVND(r.finalPrice)}</span></li>`;

  const commissionPct = r.costPerUnit > 0 ? (r.commissionPerUnit / r.costPerUnit) : 0;

  document.getElementById('m-extra-table').innerHTML = `
    <tr><th>Hạng mục</th><th>ĐVT</th><th class="num">Đơn giá</th><th class="num">SL</th><th class="num">Thành tiền</th><th class="num">Đ/Túi</th></tr>
    <tr><td>Trục in</td><td>bộ</td><td class="num">${fmt(r.cylinderCost)}</td><td class="num">1</td><td class="num">${fmt(r.cylinderCost)}</td><td class="num" style="color:var(--dim)">riêng</td></tr>
    ${r.input.hasZipper ? `<tr><td>Zipper</td><td>m</td><td class="num">${fmt(CONSTANTS.zipperPrice)}</td><td class="num">${fmt(r.cutMeters + r.cutWaste, 0)}</td><td class="num">${fmt(r.zipperTotal)}</td><td class="num">${fmt(r.zipperPerUnit, 1)}</td></tr>` : ''}
    ${r.input.hasTape ? `<tr><td>Băng keo</td><td>m</td><td class="num">${fmt(CONSTANTS.tapePrice)}</td><td class="num">${fmt(r.cutMeters + r.cutWaste, 0)}</td><td class="num">${fmt(r.tapeTotal)}</td><td class="num">${fmt(r.tapePerUnit, 1)}</td></tr>` : ''}
    ${r.input.hasHandle ? `<tr><td>Quai</td><td>cái</td><td class="num">${fmt(CONSTANTS.handlePrice)}</td><td class="num">${fmt(r.input.quantity, 0)}</td><td class="num">${fmt(r.handleTotal)}</td><td class="num">${fmt(r.handlePerUnit, 1)}</td></tr>` : ''}
    <tr><td>Thùng giấy <span style="color:var(--dim);font-size:0.75rem">(${fmt(r.actualBagsPerBox)} túi/thùng)</span></td><td>thùng</td><td class="num">${fmt(r.actualBoxPrice)}</td><td class="num">${fmt(r.numBoxes, 0)}</td><td class="num">${fmt(r.boxTotal)}</td><td class="num">${fmt(r.boxPerUnit, 1)}</td></tr>
    <tr><td>Vận chuyển <span style="color:var(--dim);font-size:0.75rem">(${fmt(r.actualShippingPerKm)}đ/km × ${fmt(r.actualShippingKm)}km)</span></td><td>tấn</td><td class="num">${fmt(r.shippingRate)}</td><td class="num">${fmt(r.tareWeight * r.input.quantity / 1000000, 3)}</td><td class="num">${fmt(r.shippingTotal)}</td><td class="num">${fmt(r.shippingPerUnit, 1)}</td></tr>
    <tr><td>Lãi vay (${r.paymentDays} ngày)</td><td>—</td><td class="num">${fmtPercent(r.interestRate30)}</td><td class="num">—</td><td class="num">${fmt(r.interestPerUnit * r.input.quantity)}</td><td class="num">${fmt(r.interestPerUnit, 1)}</td></tr>
    <tr><td>Hoa hồng</td><td>—</td><td class="num">${fmtPercent(commissionPct)}</td><td class="num">—</td><td class="num">${fmt(r.commissionPerUnit * r.input.quantity)}</td><td class="num">${fmt(r.commissionPerUnit, 1)}</td></tr>
  `;
}

// ══════════════════════════════════════════════
// TECH VIEW RENDER
// ══════════════════════════════════════════════
function renderTechView(r) {
  document.getElementById('t-structure').textContent = r.structureText;

  const tStatsHTML = `
    <div class="stat-card accent"><div class="stat-label">Đầu Vào Khâu In</div><div class="stat-value">${fmt(r.printMeters + r.printWaste, 0)} m</div></div>
    <div class="stat-card cyan"><div class="stat-label">Đầu Vào Khâu Cắt</div><div class="stat-value">${fmt(r.cutMeters + r.cutWaste, 0)} m</div></div>
    <div class="stat-card green"><div class="stat-label">Khổ Thành Phẩm</div><div class="stat-value">${fmt(r.printWidth, 3)} m</div></div>
    <div class="stat-card orange"><div class="stat-label">Khổ Màng NL</div><div class="stat-value">${fmt(r.input.spreadWidth * r.input.numImages + 0.02, 3)} m</div></div>
  `;
  document.getElementById('t-stats').innerHTML = tStatsHTML;

  // ── Bảng gộp: Chi tiết sản xuất & nguyên liệu ──
  const uniRows = [];
  // Helper: build a unified row [công đoạn, vật liệu, khổ(m), thành phẩm(m), phi hao, đầu vào VL, CPSX, thành tiền CPSX, chi phí VL (đ/m²), thành tiền CPVL]
  let totalCPSX = 0, totalCPVL = 0;

  // CPSX IN (Lớp 1 - print)
  const printInput = r.printMeters + r.printWaste;
  totalCPSX += r.printCostCPSX;
  totalCPVL += r.printCostMaterial;
  uniRows.push({
    stage: 'CPSX IN', mat: r.layers.print.material.name,
    width: r.printNLWidth, meters: r.printMeters, waste: r.printWaste,
    input: printInput, cpsx: r.printCPSX, costCPSX: r.printCostCPSX,
    matPrice: r.layers.print.material.pricePerM2, costMat: r.printCostMaterial
  });

  // GHÉP LÁMINATIONS (Từ Lớp 2 đến Lớp 5)
  if (r.layers.laminations) {
    r.layers.laminations.forEach((lam, idx) => {
      const lamInput = lam.meters + lam.waste;
      totalCPSX += lam.costCPSX;
      totalCPVL += lam.costMat;
      uniRows.push({
        stage: `GHÉP (Lớp ${lam.layerNum})`, mat: lam.material.name,
        width: lam.width, meters: lam.meters, waste: lam.waste,
        input: lamInput, cpsx: CONSTANTS.ghepCPSX, costCPSX: lam.costCPSX,
        matPrice: lam.material.pricePerM2, costMat: lam.costMat
      });
    });
  }

  // CẮT
  const cutInput = r.cutMeters + r.cutWaste;
  totalCPSX += r.cutCostCPSX;
  uniRows.push({
    stage: 'CẮT', mat: '—',
    width: r.cutWidth, meters: r.cutMeters, waste: r.cutWaste,
    input: cutInput, cpsx: r.cutCPSX, costCPSX: r.cutCostCPSX,
    matPrice: null, costMat: null
  });

  const uniHeaderTech = `<tr>
    <th>Công đoạn</th><th>Vật liệu</th>
    <th class="num">Khổ (m)</th><th class="num">Thành phẩm (m)</th><th class="num">Phi hao</th><th class="num">Đầu vào VL</th>
  </tr>`;

  const uniHeaderManager = `<tr>
    <th>Công đoạn</th><th>Vật liệu</th>
    <th class="num">Khổ (m)</th><th class="num">Thành phẩm (m)</th><th class="num">Phi hao</th><th class="num">Đầu vào VL</th>
    <th class="num">CPSX (đ/m²)</th><th class="num">Thành tiền CPSX</th>
    <th class="num">CP vật liệu (đ/m²)</th><th class="num">Thành tiền CPVL</th>
  </tr>`;

  const uniBodyTech = uniRows.map(row => {
    let dWidth = row.width;
    if (row.stage !== 'CẮT') dWidth = r.input.spreadWidth * r.input.numImages + 0.02;
    let dMeters = row.meters / r.input.numImages;
    return `<tr>
      <td>${row.stage}</td><td>${row.mat}</td>
      <td class="num">${fmt(dWidth, 3)}</td>
      <td class="num">${fmt(dMeters, 0)}</td>
      <td class="num">${fmt(row.waste, 0)}</td>
      <td class="num highlight">${fmt(row.input, 0)}</td>
    </tr>`;
  }).join('');

  const uniBodyManager = uniRows.map(row => {
    let dWidth = row.width;
    if (row.stage !== 'CẮT') dWidth = r.input.spreadWidth * r.input.numImages + 0.02;
    let dMeters = row.meters / r.input.numImages;
    return `<tr>
      <td>${row.stage}</td><td>${row.mat}</td>
      <td class="num">${fmt(dWidth, 3)}</td>
      <td class="num">${fmt(dMeters, 0)}</td>
      <td class="num">${fmt(row.waste, 0)}</td>
      <td class="num highlight">${fmt(row.input, 0)}</td>
      <td class="num">${fmt(row.cpsx, 0)}</td>
      <td class="num">${fmt(row.costCPSX, 0)}</td>
      <td class="num">${row.matPrice != null ? fmt(row.matPrice, 1) : '—'}</td>
      <td class="num">${row.costMat != null ? fmt(row.costMat, 0) : '—'}</td>
    </tr>`;
  }).join('');

  const grandTotal = totalCPSX + totalCPVL;
  const uniFooterManager = `
    <tr class="total-row">
      <td colspan="7">TỔNG</td>
      <td class="num">${fmt(totalCPSX, 0)}</td>
      <td class="num"></td>
      <td class="num">${fmt(totalCPVL, 0)}</td>
    </tr>
    <tr class="total-row" style="font-size:1.05em">
      <td colspan="7"><strong>TỔNG GIÁ VỐN SẢN XUẤT</strong></td>
      <td colspan="3" class="num" style="color:var(--accent);font-weight:800">${fmt(grandTotal, 0)} đ</td>
    </tr>`;

  document.getElementById('t-unified-table').innerHTML = uniHeaderTech + uniBodyTech;
  document.getElementById('m-t-unified-table').innerHTML = uniHeaderManager + uniBodyManager + uniFooterManager;

  const tWeightItems = [
    ['Diện tích 1 túi', fmtM2(r.bagArea)],
    ['Tổng diện tích đơn hàng', fmt(r.totalArea, 1) + ' m²'],
    ['Trọng lượng / túi (Tare)', fmt(r.tareWeight, 2) + ' gr'],
    ['Tổng trọng lượng', fmt(r.tareWeight * r.input.quantity / 1000, 1) + ' kg'],
    ['Trọng lượng (tấn)', fmt(r.tareWeight * r.input.quantity / 1000000, 3) + ' tấn']
  ];

  const mWeightItems = [...tWeightItems];

  document.getElementById('t-weight').innerHTML = tWeightItems.map(([l, v]) => `<li><span class="bl-label">${l}</span><span class="bl-value">${v}</span></li>`).join('');
  document.getElementById('m-t-weight').innerHTML = mWeightItems.map(([l, v]) => `<li><span class="bl-label">${l}</span><span class="bl-value">${v}</span></li>`).join('');
}

// ══════════════════════════════════════════════
// MOQ VIEW RENDER
// ══════════════════════════════════════════════
function renderMOQView(r) {
  const baseInput = gatherInput();
  const currentQty = baseInput.quantity;
  const moqLevels = [5000, 10000, 15000, 20000, 30000, 40000, 50000, 70000, 100000, 150000, 200000];

  if (!moqLevels.includes(currentQty)) {
    moqLevels.push(currentQty);
    moqLevels.sort((a, b) => a - b);
  }

  // Detect active layers from the current result for column headers
  const matCols = [];
  if (r.layers.print) matCols.push({ type: 'print', name: r.layers.print.material.name.split(' ')[0] });
  if (r.layers.laminations) {
    r.layers.laminations.forEach(lam => {
      matCols.push({ type: 'lam', layerNum: lam.layerNum, name: lam.material.name.split(' ')[0] });
    });
  }

  const getLayerData = (res, col) => {
    if (col.type === 'print') return res.layers.print || null;
    return res.layers.laminations?.find(l => l.layerNum === col.layerNum) || null;
  };
  const getLayerMeters = (res, col) => {
    const d = getLayerData(res, col);
    return d ? d.meters + d.waste : 0;
  };

  const calcKg = (layerMat, meters, width) => {
    if (!layerMat) return 0;
    return meters * width * layerMat.thickness * layerMat.density / 1000;
  };

  let rows = '';
  let results = [];
  moqLevels.forEach(qty => {
    const inp = { ...baseInput, quantity: qty };
    const res = calculate(inp);
    if (!res) return;
    const isCurrent = qty === currentQty;
    results.push({ qty, res, isCurrent });

    const matCells = matCols.map(col => {
      const layerData = getLayerData(res, col);
      const layerMeters = layerData ? layerData.meters + layerData.waste : 0;
      const kg = calcKg(layerData?.material, layerMeters, layerData?.width || 0);
      return `<td>${fmt(layerMeters, 0)} m<br><span style="font-size:0.75rem;color:var(--muted);font-weight:400;">(${fmt(kg, 1)} kg)</span></td>`;
    }).join('');

    rows += `
      <tr class="${isCurrent ? 'moq-highlight' : ''}">
        <td style="font-weight:${isCurrent ? '700' : '400'}">${fmt(qty)}</td>
        <td>${fmtPercent(res.profitRate)}</td>
        <td>${fmt(res.costPerUnit, 1)}</td>
        <td style="font-weight:700;color:${isCurrent ? 'var(--accent)' : 'inherit'}">${fmt(res.finalPrice, 0)}</td>
        <td>${fmt(res.finalPrice * qty / 1000000, 2)}tr</td>

        ${matCells}
      </tr>
    `;
  });

  const matHeaders = matCols.map(col => `<th>${col.name}</th>`).join('');

  document.getElementById('moq-table').innerHTML = `
    <tr><th>Số lượng</th><th>LN %</th><th>Giá vốn+LN/túi</th><th>Giá đề xuất</th><th>Tổng DT</th>${matHeaders}</tr>
    ${rows}
  `;

  // Render roll-based MOQ table
  renderRollMOQ(r, baseInput, matCols, getLayerMeters, getLayerData);
}

// ══════════════════════════════════════════════
// MOQ THEO CUỘN MÀNG
// ══════════════════════════════════════════════
function renderRollMOQ(r, baseInput, matCols, getLayerMeters, getLayerData) {
  const rollOptions = matCols;
  
  if (rollOptions.length === 0) {
    document.getElementById('moq-roll-table').innerHTML = '<tr><td>Không có lớp màng phù hợp để tính MOQ cuộn</td></tr>';
    return;
  }

  // Determine selected option
  let selectedCol = rollOptions.find(c => {
    let id = c.type === 'print' ? 'print' : `lam-${c.layerNum}`;
    return id === window.selectedMoqRollMat;
  });

  if (!selectedCol) {
    selectedCol = rollOptions[0]; // fallback to first
  }

  const selectedData = getLayerData(r, selectedCol);
  const selectedMat = selectedData.material;
  const rollLen = selectedMat.rollLength || 6000;
  
  // Total meters of the selected layer needed for the current quantity
  const totalSelectedMeters = selectedData.meters + selectedData.waste;

  // Build columns for other layers (non-selected) showing meters + kg
  const otherLayers = matCols.filter(c => c !== selectedCol);
  
  // Check if selected base is kg-based (LLDPE or PE)
  const isKgBase = selectedMat.name.toUpperCase().includes('LLDPE') || selectedMat.name.toUpperCase() === 'PE';

  // Build dropdown HTML
  let selectHTML = `<select class="form-select moq-mat-select" onchange="window.selectedMoqRollMat=this.value; doCalculate(true);" style="font-weight:700; color:var(--accent); border:1.5px solid var(--accent); padding:4px 24px 4px 8px; border-radius:6px; cursor:pointer; background:transparent; display:inline-block; font-size:0.85rem; margin:0; text-transform:uppercase;">`;
  rollOptions.forEach(c => {
    let id = c.type === 'print' ? 'print' : `lam-${c.layerNum}`;
    let name = c.name.split(' ')[0];
    let colIsKg = c.name.toUpperCase().includes('LLDPE') || c.name.toUpperCase() === 'PE';
    let suffix = colIsKg ? '(KG)' : '(CUỘN)';
    let selected = (selectedCol === c) ? 'selected' : '';
    selectHTML += `<option value="${id}" ${selected}>${name} ${suffix}</option>`;
  });
  selectHTML += `</select>`;

  const levels = isKgBase ? [200, 300, 400, 500, 600, 700] : [1, 2, 3, 4, 5, 6];

  // Helper: compute kg from meters for a given layer
  const calcKg = (layerMat, meters, width) => {
    if (!layerMat) return 0;
    return meters * width * layerMat.thickness * layerMat.density / 1000;
  };

  const getMetersFromKg = (layerMat, targetKg, width) => {
    if (!layerMat || width <= 0) return 0;
    return targetKg * 1000 / (width * layerMat.thickness * layerMat.density);
  };

  // Helper: Find precise quantity using a local binary search against calculate engine
  const findEstQtyForMeters = (targetMeters) => {
    let low = 100, high = 1000000, bestQty = 0;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      let res = calculate({ ...baseInput, quantity: mid });
      if (!res) return low; // fallback
      
      let layerData = getLayerData(res, selectedCol);
      let currentMeters = layerData ? (layerData.meters + layerData.waste) : 0;

      if (currentMeters <= targetMeters) {
        bestQty = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return Math.floor(bestQty / 100) * 100;
  };

  let rows = '';
  levels.forEach(levelVal => {
    let availableMeters = 0;
    let displayHtml = '';

    if (isKgBase) {
      availableMeters = getMetersFromKg(selectedMat, levelVal, selectedData.width);
      displayHtml = `<span style="font-weight:700;">${fmt(levelVal)} kg</span><br><span style="font-size:0.75rem;color:var(--muted);font-weight:400;">(${fmt(availableMeters, 0)} m)</span>`;
    } else {
      availableMeters = levelVal * rollLen;
      const selectedKg = calcKg(selectedMat, availableMeters, selectedData.width);
      displayHtml = `<span style="font-weight:700;">${levelVal} cuộn</span><br><span style="font-size:0.75rem;color:var(--muted);font-weight:400;">(${fmt(availableMeters, 0)}m - ${fmt(selectedKg, 1)} kg)</span>`;
    }

    const estQty = findEstQtyForMeters(availableMeters);
    if (estQty <= 0) return;

    const inp = { ...baseInput, quantity: estQty };
    const res = calculate(inp);
    if (!res) return;

    let isCurrent = false;
    if (isKgBase) {
      const currentKg = calcKg(selectedMat, totalSelectedMeters, selectedData.width);
      isCurrent = (Math.ceil(currentKg / 100) * 100) === levelVal;
    } else {
      isCurrent = levelVal === Math.ceil(totalSelectedMeters / rollLen);
    }

    // Build cells for other layers: meters + kg
    const otherCells = otherLayers.map(col => {
      const layerData = getLayerData(res, col);
      const layerMeters = layerData ? layerData.meters + layerData.waste : 0;
      const kg = calcKg(layerData?.material, layerMeters, layerData?.width || 0);
      return `<td>${fmt(layerMeters, 0)} m<br><span style="font-size:0.75rem;color:var(--muted);font-weight:400;">(${fmt(kg, 1)} kg)</span></td>`;
    }).join('');

    rows += `
      <tr class="${isCurrent ? 'moq-highlight' : ''}">
        <td>${displayHtml}</td>
        <td style="font-weight:${isCurrent ? '700' : '400'}">${fmt(estQty)}</td>
        ${otherCells}
        <td style="font-weight:700;color:${isCurrent ? 'var(--accent)' : 'inherit'}">${fmt(res.finalPrice, 0)}</td>
        <td>${fmt(res.finalPrice * estQty / 1000000, 2)}tr</td>
      </tr>
    `;
  });

  const otherHeaders = otherLayers.map(col => `<th>${col.name.split(' ')[0]}</th>`).join('');

  document.getElementById('moq-roll-table').innerHTML = `
    <tr><th>${selectHTML}</th><th>SL túi</th>${otherHeaders}<th>Giá đề xuất</th><th>Tổng DT</th></tr>
    ${rows}
  `;
}

// ══════════════════════════════════════════════
// BENTO VIEW RENDER (Creative Dashboard)
// ══════════════════════════════════════════════
function renderBentoView(r) {
  const total = r.totalProductionCost;
  const pIn = r.printTotalCost / total * 100;
  const pLam = r.totalLamCost / total * 100;
  const pCut = r.cutTotalCost / total * 100;

  // Donut chart SVG
  const radius = 60;
  const circum = 2 * Math.PI * radius;
  const seg1 = circum * pIn / 100;
  const seg2 = circum * pLam / 100;
  const seg3 = circum * pCut / 100;
  const offset1 = 0;
  const offset2 = seg1;
  const offset3 = seg1 + seg2;

  // Layer blocks
  const l1 = r.layers.print.material;
  const lamMats = (r.layers.laminations || []).map(lam => lam.material);
  const l2 = lamMats[0] || null;
  const l3 = lamMats[1] || null;
  const l4 = lamMats[2] || null;

  const makeBlock = (mat) => {
    if (mat) {
      return `<div class="bento-layer-block"><div class="bento-layer-name">${mat.name.split(' ')[0]}</div><div class="bento-layer-thick">${mat.thickness}mic</div><div class="bento-layer-price">${fmt(mat.pricePerM2, 0)} đ/m²</div></div>`;
    } else {
      return `<div class="bento-layer-block" style="background:linear-gradient(180deg,#94a3b8,#64748b);opacity:0.4"><div class="bento-layer-name">—</div><div class="bento-layer-thick">Không dùng</div></div>`;
    }
  };
  const layerBlocks = [l1, l2, l3, l4].filter(Boolean).map(mat => makeBlock(mat)).join('');

  // Price breakdown items for bar chart
  const breakdownItems = [
    { label: 'Giá vốn+LN', value: r.costPerUnit, color: 'var(--accent)' },
    { label: 'Zipper', value: r.zipperPerUnit, color: 'var(--accent2)' },
    { label: 'Thùng', value: r.boxPerUnit, color: 'var(--green)' },
    { label: 'Vận chuyển', value: r.shippingPerUnit, color: 'var(--orange)' },
    { label: 'Lãi vay', value: r.interestPerUnit, color: 'var(--pink)' },
    { label: 'Hoa hồng', value: r.commissionPerUnit, color: 'var(--red)' },
  ];
  const maxVal = Math.max(...breakdownItems.map(i => i.value), 1);

  const barsHTML = breakdownItems.map(item => `
    <div class="bento-bar-row">
      <div class="bento-bar-label">${item.label}</div>
      <div class="bento-bar-track">
        <div class="bento-bar-fill" style="width:${Math.max(item.value / maxVal * 100, 3)}%;background:${item.color}">${fmt(item.value, 1)}</div>
      </div>
      <div class="bento-bar-amount">${fmt(item.value, 1)} đ</div>
    </div>
  `).join('');

  document.getElementById('bentoGrid').innerHTML = `
    <div class="bento">

      <!-- HERO: Giá chính -->
      <div class="bento-tile bento-hero">
        <div class="bento-hero-label">Giá Đề Xuất / Túi</div>
        <div class="bento-hero-price">${fmt(r.finalPrice, 0)} <span style="font-size:0.35em;opacity:0.7">đ</span></div>
        <div class="bento-hero-unit">chưa VAT · ${r.structureText}</div>
        <div class="bento-hero-sub">${r.input.customer} — ${r.input.productName} · SL: ${fmt(r.input.quantity)} túi</div>
      </div>

      <!-- ROW 2: Metrics -->
      <div class="bento-tile bento-metric bento-accent">
        <div class="bento-metric-label">Giá Vốn + LN / Túi</div>
        <div class="bento-metric-value">${fmt(r.costPerUnit, 1)}</div>
        <div class="bento-metric-sub">đồng / túi</div>
      </div>
      <div class="bento-tile bento-metric bento-green">
        <div class="bento-metric-label">Tỉ Lệ Lợi Nhuận</div>
        <div class="bento-metric-value">${fmtPercent(r.profitRate)}</div>
        <div class="bento-metric-sub">${r.input.profitColumn === 1 ? 'Túi thường' : 'Túi phức tạp'}</div>
      </div>
      <div class="bento-tile bento-metric bento-cyan">
        <div class="bento-metric-label">Doanh thu túi</div>
        <div class="bento-metric-value">${fmt(r.revenue / 1000000, 1)}<span style="font-size:0.5em;opacity:0.7">tr</span></div>
        <div class="bento-metric-sub">${fmt(r.revenue)} đ</div>
      </div>

      <!-- ROW 3: Structure + Donut -->
      <div class="bento-tile bento-structure">
        <div class="bento-section-title">🏗️ Cấu Trúc Màng · ${r.totalThickness} mic</div>
        <div class="bento-layers">${layerBlocks}</div>
        <div class="bento-struct-info">
          <div><span class="bsi-label">Kích thước</span><span class="bsi-value">${+(r.input.spreadWidth * 100).toFixed(1)}×${+(r.input.cutStep * 100).toFixed(1)}cm</span></div>
          <div><span class="bsi-label">Diện tích</span><span class="bsi-value">${fmtM2(r.bagArea)}</span></div>
          <div><span class="bsi-label">Trọng lượng</span><span class="bsi-value">${fmt(r.tareWeight, 2)} gr</span></div>

          <div><span class="bsi-label">Đầu vào khâu in</span><span class="bsi-value">${fmt(r.printMeters + r.printWaste, 0)} m</span></div>
          <div><span class="bsi-label">Đầu vào khâu cắt</span><span class="bsi-value">${fmt(r.cutMeters + r.cutWaste, 0)} m</span></div>
        </div>
      </div>

      <div class="bento-tile bento-donut">
        <div class="bento-section-title">📊 Cơ Cấu Giá Vốn SX</div>
        <div class="donut-wrap">
          <svg viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--accent)" stroke-width="16"
              stroke-dasharray="${seg1} ${circum - seg1}" stroke-dashoffset="-${offset1}" stroke-linecap="round" />
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--accent2)" stroke-width="16"
              stroke-dasharray="${seg2} ${circum - seg2}" stroke-dashoffset="-${offset2}" />
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--orange)" stroke-width="16"
              stroke-dasharray="${seg3} ${circum - seg3}" stroke-dashoffset="-${offset3}" />
          </svg>
          <div class="donut-center">
            <div class="donut-center-val">${fmt(total / 1000000, 1)}tr</div>
            <div class="donut-center-label">Tổng GV</div>
          </div>
        </div>
        <div class="donut-legend">
          <div class="donut-legend-item"><div class="donut-legend-dot" style="background:var(--accent)"></div>In ${pIn.toFixed(0)}%</div>
          <div class="donut-legend-item"><div class="donut-legend-dot" style="background:var(--accent2)"></div>Ghép ${pLam.toFixed(0)}%</div>
          <div class="donut-legend-item"><div class="donut-legend-dot" style="background:var(--orange)"></div>Cắt ${pCut.toFixed(0)}%</div>
        </div>
      </div>

      <!-- ROW 4: Breakdown bars + extra metrics -->
      <div class="bento-tile bento-breakdown">
        <div class="bento-section-title">💰 Chi Tiết Giá / Túi</div>
        ${barsHTML}
        <div class="bento-bar-row" style="margin-top:8px;border-top:2px solid var(--accent);padding-top:10px">
          <div class="bento-bar-label" style="font-weight:700;color:var(--accent)">TỔNG</div>
          <div style="flex:1"></div>
          <div class="bento-bar-amount" style="color:var(--accent);font-size:1.1rem;font-weight:800">${fmt(r.finalPrice, 0)} đ</div>
        </div>
      </div>

      <div class="bento-tile bento-breakdown">
        <div class="bento-section-title">💵 Chi Phí Phụ</div>
        <div class="bento-bar-row">
          <div class="bento-bar-label">Trục in</div>
          <div class="bento-bar-track"><div class="bento-bar-fill" style="width:100%;background:var(--accent)">${fmt(r.cylinderCost / 1000000, 1)}tr</div></div>
          <div class="bento-bar-amount">${fmt(r.cylinderCost / 1000000, 1)}tr</div>
        </div>
        <div class="bento-bar-row">
          <div class="bento-bar-label">Zipper tổng</div>
          <div class="bento-bar-track"><div class="bento-bar-fill" style="width:${r.zipperTotal > 0 ? Math.max(r.zipperTotal / r.cylinderCost * 100, 5) : 0}%;background:var(--accent2)">${fmt(r.zipperTotal)}</div></div>
          <div class="bento-bar-amount">${fmt(r.zipperTotal)}</div>
        </div>
        <div class="bento-bar-row">
          <div class="bento-bar-label">Thùng tổng</div>
          <div class="bento-bar-track"><div class="bento-bar-fill" style="width:${r.cylinderCost > 0 ? Math.max(r.boxTotal / r.cylinderCost * 100, 5) : 0}%;background:var(--green)">${fmt(r.boxTotal)}</div></div>
          <div class="bento-bar-amount">${fmt(r.boxTotal)}</div>
        </div>
        <div class="bento-bar-row">
          <div class="bento-bar-label">Vận chuyển</div>
          <div class="bento-bar-track"><div class="bento-bar-fill" style="width:${r.cylinderCost > 0 ? Math.max(r.shippingTotal / r.cylinderCost * 100, 5) : 0}%;background:var(--orange)">${fmt(r.shippingTotal)}</div></div>
          <div class="bento-bar-amount">${fmt(r.shippingTotal)}</div>
        </div>
      </div>

      <!-- ROW 5: Full-width order info -->
      <div class="bento-tile bento-wide">
        <div class="bento-section-title">🧾 Tổng Quan Đơn Hàng</div>
        <div class="bento-kv-grid">
          <div class="bento-kv"><span class="bento-kv-label">Khách hàng</span><span class="bento-kv-value">${r.input.customer}</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Sản phẩm</span><span class="bento-kv-value">${r.input.productName}</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Cấu trúc</span><span class="bento-kv-value">${r.structureText}</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Số lượng</span><span class="bento-kv-value">${fmt(r.input.quantity)} túi</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Kích thước</span><span class="bento-kv-value">${+(r.input.spreadWidth * 1000).toFixed(0)}×${+(r.input.cutStep * 1000).toFixed(0)} mm²</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Độ dày</span><span class="bento-kv-value">${r.totalThickness} mic</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Trọng lượng</span><span class="bento-kv-value">${fmt(r.tareWeight, 2)} gr/cái</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Tổng TL</span><span class="bento-kv-value">${fmt(r.tareWeight * r.input.quantity / 1000, 1)} kg</span></div>
          <div class="bento-kv"><span class="bento-kv-label">Diện tích</span><span class="bento-kv-value">${fmtM2(r.bagArea)}</span></div>
        </div>
      </div>

      <!-- Bottom metrics -->
      <div class="bento-tile bento-metric bento-orange">
        <div class="bento-metric-label">Trục In</div>
        <div class="bento-metric-value">${fmt(r.cylinderCost / 1000000, 1)}<span style="font-size:0.5em;opacity:0.7">tr</span></div>
        <div class="bento-metric-sub">tính riêng</div>
      </div>

      <div class="bento-tile bento-metric bento-accent">
        <div class="bento-metric-label">Tổng Giá Vốn SX</div>
        <div class="bento-metric-value">${fmt(total / 1000000, 1)}<span style="font-size:0.5em;opacity:0.7">tr</span></div>
        <div class="bento-metric-sub">${fmt(total)} đ</div>
      </div>

      <!-- CTA to edit -->
      <div class="bento-tile bento-cta" onclick="setLayout('default');switchView('sale');">
        <span class="bento-cta-icon">✏️</span>
        <span class="bento-cta-text">Quay lại chỉnh sửa thông số</span>
      </div>

    </div>
  `;
}

// ══════════════════════════════════════════════
// CHỐT GIÁ ANALYSIS (LIVE)
// ══════════════════════════════════════════════
function analyzeChotGia() {
  const el = document.getElementById('chotAnalysis');
  const val = parseFmtNumber(document.getElementById('chotGia').value);
  if (!val || !currentResult) { el.innerHTML = ''; return; }

  const r = currentResult;
  const diff = val - r.finalPrice;
  if (diff === 0) { el.innerHTML = ''; return; }
  
  const doanhThu = val * r.input.quantity;
  
  let newHoaHongPerUnit = (r.commissionPerUnit || 0) + diff;
  const profitNoticeEl = document.getElementById('s-profit-card-notice');
  if (newHoaHongPerUnit < 0) {
    const profitDrop = Math.abs(newHoaHongPerUnit) * r.input.quantity;
    const dropPct = r.profitAmount > 0 ? (profitDrop / r.profitAmount) : 0;
    newHoaHongPerUnit = 0;
    if (profitNoticeEl) {
      profitNoticeEl.innerHTML = `<div style="color:#d9534f; font-size:0.85rem; font-weight:700; margin-top:8px;">⚠️ Giảm ${fmt(profitDrop)} đ (${fmtPercent(dropPct)}) LN so với đề xuất</div>`;
    }
  } else {
    if (profitNoticeEl) profitNoticeEl.innerHTML = '';
  }
  
  const tongHoaHong = newHoaHongPerUnit * r.input.quantity;

  const tongChiPhi = r.totalProductionCost 
                   + (r.zipperTotal || 0) 
                   + (r.tapeTotal || 0) 
                   + (r.handleTotal || 0) 
                   + (r.boxTotal || 0) 
                   + (r.shippingTotal || 0) 
                   + ((r.interestPerUnit || 0) * r.input.quantity);

  const lnCongTy = doanhThu - tongChiPhi - tongHoaHong;

  const pctLnCongTy = r.totalProductionCost > 0 ? (lnCongTy / r.totalProductionCost) : 0;
  const pctHoaHong = r.costPerUnit > 0 ? (newHoaHongPerUnit / r.costPerUnit) : 0;

  const cls = diff >= 0 ? 'positive' : 'negative';
  const icon = diff >= 0 ? '✅' : '⚠️';

  el.innerHTML = `
    <div class="chot-analysis ${cls}">
      <div class="chot-row">
        <span class="chot-label">${icon} Chênh lệch / túi</span>
        <span class="chot-value">${diff >= 0 ? '+' : ''}${fmt(diff, 1)} đ/túi</span>
      </div>
      <div class="chot-row" style="font-weight:700;">
        <span class="chot-label">Doanh thu tổng</span>
        <span class="chot-value">${fmt(val)} đ/túi × ${fmt(r.input.quantity)} túi = ${fmt(doanhThu)} đ</span>
      </div>
      <div class="chot-row">
        <span class="chot-label">LN công ty (${fmtPercent(pctLnCongTy)})</span>
        <span class="chot-value">${fmt(lnCongTy)} đ</span>
      </div>
      <div class="chot-row">
        <span class="chot-label">% Hoa hồng (${fmtPercent(pctHoaHong)})</span>
        <span class="chot-value">${fmt(tongHoaHong)} đ</span>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════
function renderHistory() {
  const list = getHistory();
  const el = document.getElementById('historyList');
  const searchVal = (document.getElementById('historySearch')?.value || '').toLowerCase();

  const filtered = searchVal
    ? list.filter(h => [h.customer, h.productName, h.structure, String(h.finalPrice)]
      .some(s => s && s.toLowerCase().includes(searchVal)))
    : list;

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>${searchVal ? 'Không tìm thấy kết quả' : 'Chưa có lịch sử tính giá'}</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(h => `
    <div class="history-item" onclick="loadFromHistory(${h.id})">
      <div class="hi-info">
        <div class="hi-name">${h.customer} — ${h.productName}</div>
        <div class="hi-date">${h.date} | ${h.structure} | SL: ${fmt(h.quantity)}</div>
        ${h.chotGia ? `<div class="hi-chot">Giá chốt: ${fmt(h.chotGia)} đ</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="hi-price">${fmt(h.finalPrice, 0)} đ</div>
        ${h.chotGia ? `<span class="badge ${h.chotGia >= h.finalPrice ? 'badge-green' : 'badge-red'}">${h.chotGia >= h.finalPrice ? '↑' : '↓'} ${fmt(h.chotGia - h.finalPrice, 0)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function loadFromHistory(id) {
  const list = getHistory();
  const item = list.find(h => h.id === id);
  if (!item || !item.input) return;
  const inp = item.input;
  document.getElementById('customer').value = inp.customer || '';
  document.getElementById('productName').value = inp.productName || '';
  // Restore product type and sub-type
  document.getElementById('productType').value = inp.productType || 'tui';
  handleProductType();
  if (inp.productType === 'mang') {
    document.getElementById('filmType').value = inp.filmType || '';
  } else {
    document.getElementById('bagType').value = inp.bagType || '';
  }
  handleSubType();
  setFmtValue('quantity', inp.quantity || 0);
  document.getElementById('numColors').value = inp.numColors != null ? inp.numColors : 4;
  // Mở khóa tất cả lớp trước khi gán giá trị (sequential enforcement có thể đã disable)
  [1, 2, 3, 4, 5].forEach(i => { const s = document.getElementById('layer' + i); if (s) s.disabled = false; });
  document.getElementById('layer1').value = inp.layer1Id || 'PET';
  document.getElementById('layer2').value = inp.layer2Id || '';
  document.getElementById('layer3').value = inp.layer3Id || '';
  document.getElementById('layer4').value = inp.layer4Id || '';
  document.getElementById('layer5').value = inp.layer5Id || '';
  // Áp dụng lại ràng buộc thứ tự theo giá trị vừa khôi phục
  [1, 2, 3, 4, 5].forEach(i => handleLayerChange(i));
  document.getElementById('spreadWidth').value = inp.spreadWidth || 0.53;
  document.getElementById('cutStep').value = inp.cutStep || 0.145;
  document.getElementById('hasNhu').checked = (inp.metallicSurcharge || 0) >= CONSTANTS.nhuPrice;
  document.getElementById('hasMo').checked = (inp.metallicSurcharge || 0) >= (CONSTANTS.nhuPrice + CONSTANTS.moPrice);
  document.getElementById('coverage').value = (inp.coverageRatio || 1) * 100;
  document.getElementById('hasZipper').checked = inp.hasZipper || false;
  // Restore payment term
  const savedDays = String(inp.paymentDays || 30);
  const paymentRadio = document.querySelector(`input[name="paymentTerm"][value="${savedDays}"]`);
  if (paymentRadio) paymentRadio.checked = true;
  const paymentRateInput = document.getElementById('pt_rate_' + savedDays);
  if (paymentRateInput && inp.paymentInterestRate !== undefined) {
     paymentRateInput.value = inp.paymentInterestRate * 100;
  }
  document.getElementById('cylLength').value = inp.cylLength || 0.63;
  document.getElementById('cylCircum').value = inp.cylCircum || 0.4;
  setFmtValue('cylUnitPrice', inp.cylUnitPrice || 7300000);
  // Restore commission settings
  if (inp.commissionUnit === 'vnd') {
    document.getElementById('commissionUnit').value = 'vnd';
    document.getElementById('commission').value = inp.commissionInputValue || inp.commissionFixedVND || 0;
  } else {
    document.getElementById('commissionUnit').value = 'percent';
    document.getElementById('commission').value = inp.commissionInputValue || (inp.commissionRate || 0) * 100;
  }
  setFmtValue('bagsPerBox', inp.bagsPerBox || 0);
  setFmtValue('boxPrice', inp.boxPrice || 0);
  setFmtValue('shippingPerKm', inp.shippingPerKm || 0);
  document.getElementById('shippingKm').value = inp.shippingKm || 0;
  if (item.chotGia) setFmtValue('chotGia', item.chotGia);
  updateStructurePreview();
  doCalculate();
  switchView('sale');
  showToast('Đã tải: ' + item.customer + ' — ' + item.productName, 'info');
}

// ══════════════════════════════════════════════
// CHỐT GIÁ SAVE
// ══════════════════════════════════════════════
function saveChotGia() {
  const val = parseFmtNumber(document.getElementById('chotGia').value);
  if (!val || !currentResult) {
    showToast('Vui lòng nhập giá chốt và tính giá trước.', 'error');
    return;
  }
  const list = getHistory();
  if (list.length > 0) {
    list[0].chotGia = val;
    localStorage.setItem('lts_history', JSON.stringify(list));
  }
  
  document.getElementById('s-price').innerHTML = `${fmt(val)} <span style="font-size:0.45em; font-weight:700; color:var(--green); vertical-align:middle; background:rgba(46,204,113,0.15); padding:4px 8px; border-radius:12px; margin-left:8px;">Giá chốt</span>`;
  
  // Re-calculate the 4 stat cards
  const r = currentResult;
  const diff = val - r.finalPrice;
  const doanhThu = val * r.input.quantity;
  
  let newHoaHongPerUnit = (r.commissionPerUnit || 0) + diff;
  let noticeHtml = '';
  if (newHoaHongPerUnit < 0) {
    const profitDrop = Math.abs(newHoaHongPerUnit) * r.input.quantity;
    const dropPct = r.profitAmount > 0 ? (profitDrop / r.profitAmount) : 0;
    newHoaHongPerUnit = 0;
    noticeHtml = `<div style="color:#d9534f; font-size:0.85rem; font-weight:700; margin-top:8px;">⚠️ Giảm ${fmt(profitDrop)} đ (${fmtPercent(dropPct)}) LN so với đề xuất</div>`;
  }
  
  const tongHoaHong = newHoaHongPerUnit * r.input.quantity;
  const tongChiPhi = r.totalProductionCost 
                   + (r.zipperTotal || 0) 
                   + (r.tapeTotal || 0) 
                   + (r.handleTotal || 0) 
                   + (r.boxTotal || 0) 
                   + (r.shippingTotal || 0) 
                   + ((r.interestPerUnit || 0) * r.input.quantity);
  const lnCongTy = doanhThu - tongChiPhi - tongHoaHong;
  const pctLnCongTy = r.totalProductionCost > 0 ? (lnCongTy / r.totalProductionCost) : 0;
  const pctHoaHong = r.costPerUnit > 0 ? (newHoaHongPerUnit / r.costPerUnit) : 0;

  document.getElementById('s-stats').innerHTML = `
    <div class="stat-card green" style="position:relative"><div class="stat-label">Lợi Nhuận</div><div class="stat-value" style="font-size:1.15rem">${fmt(lnCongTy)}đ <span style="font-size:0.85rem">(${fmtPercent(pctLnCongTy)})</span></div><div id="s-profit-card-notice">${noticeHtml}</div></div>
    <div class="stat-card cyan"><div class="stat-label">Doanh thu túi</div><div class="stat-value">${fmt(doanhThu)} đ</div></div>
    <div class="stat-card orange"><div class="stat-label">Giá Bán/Túi</div><div class="stat-value">${fmt(val, 0)} đ</div></div>
    <div class="stat-card pink"><div class="stat-label">Hoa hồng</div><div class="stat-value" style="font-size:1.15rem">${fmt(tongHoaHong)} đ <div style="font-size:0.85rem; font-weight:normal; margin-top:4px;">${fmt(newHoaHongPerUnit, 1)} đ/túi (${fmtPercent(pctHoaHong)})</div></div></div>
  `;

  // Hide the green box since the price has been officially committed
  document.getElementById('chotAnalysis').innerHTML = '';

  showToast(`Đã thay thế Giá đề xuất bằng Giá chốt mới là ${fmt(val)} đ/túi`, 'success');
}

// ══════════════════════════════════════════════
// RESET FORM
// ══════════════════════════════════════════════
function resetForm() {
  document.getElementById('customer').value = '';
  document.getElementById('productName').value = '';
  document.getElementById('quantity').value = '';
  document.getElementById('numColors').value = '';
  // Mở khóa tất cả lớp trước khi reset (để set value=''), sequential sẽ disable lại sau
  [1, 2, 3, 4, 5].forEach(i => { const s = document.getElementById('layer' + i); if (s) s.disabled = false; });
  document.getElementById('layer1').value = '';
  document.getElementById('layer2').value = '';
  document.getElementById('layer3').value = '';
  document.getElementById('layer4').value = '';
  document.getElementById('layer5').value = '';
  document.getElementById('spreadWidth').value = '';
  document.getElementById('cutStep').value = '';
  if (document.getElementById('hasNhu')) document.getElementById('hasNhu').checked = false;
  if (document.getElementById('hasMo')) document.getElementById('hasMo').checked = false;
  if (document.getElementById('coverage')) document.getElementById('coverage').value = '';
  if (document.getElementById('handleWeight')) document.getElementById('handleWeight').value = '';
  if (document.getElementById('hasHandle')) document.getElementById('hasHandle').checked = false;
  if (document.getElementById('hasTape')) document.getElementById('hasTape').checked = false;
  if (document.getElementById('hasZipper')) document.getElementById('hasZipper').checked = false;
  // Reset payment term to 30 days
  const defaultRadio = document.querySelector('input[name="paymentTerm"][value="30"]');
  if (defaultRadio) defaultRadio.checked = true;
  document.getElementById('pt_rate_14').value = "0.1";
  document.getElementById('pt_rate_30').value = "0.25";
  document.getElementById('pt_rate_90').value = "0.75";
  document.getElementById('cylLength').value = '';
  document.getElementById('cylCircum').value = '';
  setFmtValue('cylUnitPrice', CONSTANTS.cylinderPricePerUnit || 7300000);
  document.getElementById('commission').value = '';
  document.getElementById('commissionUnit').value = 'percent';
  document.getElementById('commissionHint').textContent = '';
  document.getElementById('bagsPerBox').value = '';
  document.getElementById('boxPrice').value = '';
  document.getElementById('shippingPerKm').value = '';
  document.getElementById('shippingKm').value = '';
  document.getElementById('chotGia').value = '';
  document.getElementById('chotAnalysis').innerHTML = '';
  // Reset mic adjust inputs
  [1, 2, 3, 4, 5].forEach(i => handleLayerChange(i));
  currentResult = null;
  document.getElementById('emptyState').style.display = '';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  updateStructurePreview();
  showToast('Đã reset form.', 'info');
}

// ══════════════════════════════════════════════
// COPY RESULT
// ══════════════════════════════════════════════
function copyResult() {
  if (!currentResult) { showToast('Chưa có kết quả để copy.', 'error'); return; }
  const r = currentResult;
  const text = [
    `${r.input.customer} — ${r.input.productName}`,
    `Cấu trúc: ${r.structureText} | Độ dày: ${r.totalThickness}mic`,
    `SL: ${fmt(r.input.quantity)} túi | KT: ${+(r.input.spreadWidth * 1000).toFixed(0)}×${+(r.input.cutStep * 1000).toFixed(0)} mm²`,
    `GIÁ ĐỀ XUẤT: ${fmt(r.finalPrice, 0)} đ/túi (chưa VAT)`,
    `Giá vốn: ${fmt(r.costPerUnit, 1)} | LN: ${fmtPercent(r.profitRate)} | DT: ${fmt(r.revenue / 1000000, 1)}tr`,
    `Trục in: ${fmt(r.cylinderCost / 1000000, 1)}tr (riêng)`,
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã copy kết quả!', 'success');
  }).catch(() => showToast('Không thể copy.', 'error'));
}

// ══════════════════════════════════════════════
// EXPORT TXT
// ══════════════════════════════════════════════
function exportResult() {
  if (!currentResult) { showToast('Chưa có kết quả để xuất.', 'error'); return; }
  const r = currentResult;
  const chotGia = parseFmtNumber(document.getElementById('chotGia').value) || null;
  const text = [
    'BÁO GIÁ TÚI BAO BÌ - CTY CP LAI TRƯỜNG SƠN',
    '═'.repeat(50),
    `Ngày: ${new Date().toLocaleDateString('vi-VN')}`,
    `Khách hàng: ${r.input.customer}`,
    `Sản phẩm: ${r.input.productName}`,
    `Cấu trúc: ${r.structureText}`,
    `Số lượng: ${fmt(r.input.quantity)} túi`,
    `Kích thước: ${+(r.input.spreadWidth * 1000).toFixed(0)} × ${+(r.input.cutStep * 1000).toFixed(0)} mm²`,
    `Độ dày: ${r.totalThickness} mic`,
    `Trọng lượng: ${fmt(r.tareWeight, 2)} gr/cái`,
    '',
    'CHI TIẾT GIÁ BÁN / TÚI',
    '─'.repeat(40),
    `Giá vốn + LN:  ${fmt(r.costPerUnit, 1)} đ`,
    `Zipper:         ${fmt(r.zipperPerUnit, 1)} đ`,
    `Thùng giấy:     ${fmt(r.boxPerUnit, 1)} đ`,
    `Vận chuyển:     ${fmt(r.shippingPerUnit, 1)} đ`,
    `Lãi vay:        ${fmt(r.interestPerUnit, 1)} đ`,
    `Hoa hồng:       ${fmt(r.commissionPerUnit, 1)} đ`,
    '─'.repeat(40),
    `GIÁ ĐỀ XUẤT:   ${fmt(r.finalPrice, 0)} đ/túi (chưa VAT)`,
    chotGia ? `GIÁ CHỐT:       ${fmt(chotGia, 0)} đ/túi` : '',
    '',
    `Tỉ lệ LN: ${fmtPercent(r.profitRate)}`,
    `Doanh thu túi: ${fmt(r.revenue)} đ`,
    `Giá trục in: ${fmt(r.cylinderCost)} đ (riêng)`,

  ].filter(Boolean).join('\n');

  const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BaoGia_${r.input.customer}_${r.input.productName}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất file báo giá!', 'success');
}

// ══════════════════════════════════════════════
// EXPORT HISTORY CSV
// ══════════════════════════════════════════════
function exportHistory() {
  const list = getHistory();
  if (!list.length) { showToast('Chưa có lịch sử.', 'error'); return; }
  let csv = '\ufeffNgày,Khách hàng,Sản phẩm,Cấu trúc,Số lượng,Giá đề xuất,Giá chốt\n';
  list.forEach(h => {
    csv += `"${h.date}","${h.customer}","${h.productName}","${h.structure}",${h.quantity},${Math.round(h.finalPrice)},${h.chotGia || ''}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LichSu_BaoGia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất lịch sử CSV!', 'success');
}

// ══════════════════════════════════════════════
// CONFIG PAGE – Cơ số sản xuất (full-page tab)
// ══════════════════════════════════════════════

// Store original defaults for reset
const MATERIALS_DEFAULTS = MATERIALS.map(m => ({
  id: m.id, thickness: m.thickness, pricePerKg: m.pricePerKg, inkPricePerColor: m.inkPricePerColor
}));

// ── Number formatting with "." thousands separator ──
function dotFmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}
function parseDotFmt(s) {
  // "7.300.000" → 7300000, "34.091" → 34091
  return parseFloat(String(s).replace(/\./g, '').replace(/,/g, '.')) || 0;
}
function fmtCfgInput(input) {
  // Save cursor position
  const pos = input.selectionStart;
  const oldLen = input.value.length;
  const raw = parseDotFmt(input.value);
  if (raw > 0) {
    input.value = dotFmt(raw);
    // Restore cursor position accounting for added dots
    const newLen = input.value.length;
    input.selectionStart = input.selectionEnd = pos + (newLen - oldLen);
  }
}

function renderMaterialPriceTable() {
  const tbody = document.getElementById('materialPriceBody');
  if (!tbody) return;
  const fmtM2 = n => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  tbody.innerHTML = MATERIALS.map((m, i) => {
    const defaultM = MATERIALS_DEFAULTS[i];
    const thkChanged = m.thickness !== defaultM.thickness ? ' changed' : '';
    const priceChanged = m.pricePerKg !== defaultM.pricePerKg ? ' changed' : '';
    return `<tr>
      <td>${i + 1}</td>
      <td class="mat-name">${m.name}</td>
      <td class="mat-density">${m.density}</td>
      <td><input class="cfg-input${thkChanged}" type="text" value="${dotFmt(m.thickness)}"
           data-idx="${i}" data-field="thickness" oninput="fmtCfgInput(this)" onchange="updateMaterialPrice(this)"></td>
      <td><input class="cfg-input${priceChanged}" type="text" value="${dotFmt(m.pricePerKg)}"
           data-idx="${i}" data-field="pricePerKg" oninput="fmtCfgInput(this)" onchange="updateMaterialPrice(this)"></td>
      <td class="mat-price-m2" id="priceM2_${i}">${fmtM2(m.pricePerM2)}</td>
    </tr>`;
  }).join('');
}

function updateMaterialPrice(input) {
  const idx = parseInt(input.dataset.idx);
  const field = input.dataset.field;
  const val = parseDotFmt(input.value);
  const m = MATERIALS[idx];
  const defaultM = MATERIALS_DEFAULTS[idx];

  m[field] = val;
  // Recalculate VND/m²
  m.pricePerM2 = m.pricePerKg * m.thickness * m.density / 1000;

  // Update display
  const cell = document.getElementById('priceM2_' + idx);
  if (cell) cell.textContent = m.pricePerM2.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

  // Highlight if changed from default
  const isChanged = m[field] !== defaultM[field];
  input.classList.toggle('changed', isChanged);

  // Also update the layer dropdown options
  updateLayerDropdowns();
  saveMaterialConfig();
}

// ── Ink Price Table ──
function renderInkPriceTable() {
  const tbody = document.getElementById('inkPriceBody');
  if (!tbody) return;

  // Build unique-name rows (first occurrence per name wins for display)
  const seen = new Set();
  let rowNum = 0;
  tbody.innerHTML = MATERIALS.map((m, i) => {
    if (seen.has(m.name)) return ''; // skip duplicates
    seen.add(m.name);
    rowNum++;
    // Check if ANY material with this name has a changed ink price
    const inkChanged = MATERIALS.some((mat, j) =>
      mat.name === m.name && mat.inkPricePerColor !== MATERIALS_DEFAULTS[j].inkPricePerColor
    ) ? ' changed' : '';
    return `<tr>
      <td>${rowNum}</td>
      <td class="mat-name">${m.name}</td>
      <td><input class="cfg-input${inkChanged}" type="text" value="${dotFmt(m.inkPricePerColor)}"
           data-name="${m.name}" oninput="fmtCfgInput(this)" onchange="updateInkPrice(this)"></td>
    </tr>`;
  }).join('');
}

function updateInkPrice(input) {
  const name = input.dataset.name;
  const val = parseDotFmt(input.value);
  // Apply to ALL materials sharing the same name
  MATERIALS.forEach((m, i) => {
    if (m.name === name) {
      m.inkPricePerColor = val;
    }
  });
  // Highlight if changed from any default in this group
  const isChanged = MATERIALS.some((m, i) =>
    m.name === name && m.inkPricePerColor !== MATERIALS_DEFAULTS[i].inkPricePerColor
  );
  input.classList.toggle('changed', isChanged);
  saveMaterialConfig();
}

// ── Print Waste Table ──
function renderPrintWasteTable() {
  const tbody = document.getElementById('printWasteBody');
  if (!tbody) return;

  const elCHeader = document.getElementById('cfgWasteC_header');
  if (elCHeader) elCHeader.value = CONSTANTS.printWasteC;

  const elAHeader = document.getElementById('cfgWasteA_header');
  if (elAHeader) elAHeader.value = CONSTANTS.printWasteA;

  let rows = '';
  // 8 colors down to 1
  for (let i = 8; i >= 1; i--) {
    let row = `<tr>
      <td>${i} màu</td>
      <td><input class="config-inline-input" type="number" style="width:70px"
                 id="cfgSetup_${i}" value="${CONSTANTS.colorSetup[i]}"
                 onchange="updatePrintWasteConfig()"></td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="display:flex; justify-content:center; align-items:center; gap:8px;">
          <span style="font-size: 0.9em; color: var(--text);">CD / ${CONSTANTS.printWasteA}</span>
          <span style="font-size: 0.9em; color: var(--muted)">×</span>
          <input type="number" class="config-inline-input" style="width:75px" id="cfgWasteB_${i}" value="${CONSTANTS.printWasteB}" onchange="updatePrintWasteConfig(${i})">
        </div>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="display:flex; justify-content:center; align-items:center; gap:8px;">
          <span style="font-size: 0.9em; color: var(--text);">+ CD / ${CONSTANTS.printWasteC}</span>
          <span style="font-size: 0.9em; color: var(--muted)">×</span>
          <input type="number" class="config-inline-input" style="width:75px" id="cfgWasteD_${i}" value="${CONSTANTS.printWasteD}" onchange="updatePrintWasteConfig(${i})">
        </div>
      </td>
    </tr>`;
    rows += row;
  }
  tbody.innerHTML = rows;
}

function updatePrintWasteConfig(changedRowIndex) {
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById('cfgSetup_' + i);
    if (el) CONSTANTS.colorSetup[i] = parseFloat(el.value) || 0;
  }

  const elC = document.getElementById('cfgWasteC_header');
  if (elC) CONSTANTS.printWasteC = parseFloat(elC.value) || 0;

  const elA = document.getElementById('cfgWasteA_header');
  if (elA) CONSTANTS.printWasteA = parseFloat(elA.value) || 0;

  const idx = (changedRowIndex === 'header') ? 8 : (changedRowIndex || 8);
  const elB = document.getElementById('cfgWasteB_' + idx);
  const elD = document.getElementById('cfgWasteD_' + idx);

  if (elB) CONSTANTS.printWasteB = parseFloat(elB.value) || 0;
  if (elD) CONSTANTS.printWasteD = parseFloat(elD.value) || 0;

  saveMaterialConfig();
  renderPrintWasteTable(); // Sync all other rows to display the same values
  showToast('Đã cập nhật phi hao in!', 'success');
}

function updateLayerDropdowns() {
  [1, 2, 3, 4, 5].forEach(i => {
    const sel = document.getElementById('layer' + i);
    if (!sel) return;
    const currentVal = sel.value;
    const firstOpt = sel.querySelector('option:first-child');
    sel.innerHTML = '';
    if (firstOpt) sel.appendChild(firstOpt);
    MATERIALS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function renderProfitTable() {
  const tbody = document.getElementById('profitTableBody');
  if (!tbody) return;
  const fmtM2 = n => n.toLocaleString('vi-VN');
  
  function getRangeLabel(i, row) {
    if (i === 0) return 'Dưới 9.900.000';
    if (row.threshold === 19000000) return '10.000.000 - 19.000.000';
    if (row.threshold === 30000000) return '20.000.000 - 30.000.000';
    if (row.threshold === 40000000) return '31.000.000 - 40.000.000';
    if (row.threshold === 60000000) return '41.000.000 - 60.000.000';
    if (row.threshold === 80000000) return '61.000.000 - 80.000.000';
    if (row.threshold === 100000000) return '81.000.000 - 100.000.000';
    if (row.threshold === 150000000) return '101.000.000 - 150.000.000';
    if (row.threshold === 200000000) return '151.000.000 - 200.000.000';
    if (row.threshold === 300000000) return '201.000.000 - 300.000.000';
    if (row.threshold === 400000000) return '301.000.000 - 400.000.000';
    return `Từ ${fmtM2(PROFIT_TABLE[i-1].threshold)} - ${fmtM2(row.threshold)}`;
  }
  
  const cgDropdown = document.getElementById('configCustomerGroup');
  const isSVLG = cgDropdown && cgDropdown.value === 'svlg';
  const offset = isSVLG ? -0.03 : 0;
  
  let rows = '';
  for (let i = 0; i < PROFIT_TABLE.length; i++) {
    const row = PROFIT_TABLE[i];
    const label = getRangeLabel(i, row);
    
    rows += `<tr>
      <td>${label}</td>
      <td><input class="cfg-input" type="number" step="0.5" value="${+((row.col1 + offset) * 100).toFixed(2)}"
           onchange="updateProfitConfig(${i}, 'col1', this.value)"> %</td>
      <td><input class="cfg-input" type="number" step="0.5" value="${+((row.col2 + offset) * 100).toFixed(2)}"
           onchange="updateProfitConfig(${i}, 'col2', this.value)"> %</td>
    </tr>`;
  }
  tbody.innerHTML = rows;
}

function handleProfitCustomerGroupChange() {
  renderProfitTable();
  if (typeof autoCalcCylinder === 'function') {
    autoCalcCylinder();
  }
}

function updateProfitConfig(idx, col, value) {
  let val = parseFloat(value);
  if (isNaN(val)) val = 0;
  
  const cgDropdown = document.getElementById('configCustomerGroup');
  const isSVLG = cgDropdown && cgDropdown.value === 'svlg';
  const offset = isSVLG ? -0.03 : 0;
  
  PROFIT_TABLE[idx][col] = (val / 100) - offset;
  saveMaterialConfig();
  showToast('Đã cập nhật bảng lợi nhuận!', 'success');
}

function resetMaterialPrices() {
  if (!confirm('Reset tất cả giá về mặc định?')) return;
  MATERIALS_DEFAULTS.forEach((def, i) => {
    MATERIALS[i].thickness = def.thickness;
    MATERIALS[i].pricePerKg = def.pricePerKg;
    MATERIALS[i].inkPricePerColor = def.inkPricePerColor;
    MATERIALS[i].pricePerM2 = MATERIALS[i].pricePerKg * MATERIALS[i].thickness * MATERIALS[i].density / 1000;
  });
  // Revert PROFIT_TABLE
  PROFIT_TABLE_DEFAULTS.forEach((def, i) => {
    PROFIT_TABLE[i].col1 = def.col1;
    PROFIT_TABLE[i].col2 = def.col2;
  });
  // Revert CONSTANTS print waste table logic missing defaults
  CONSTANTS.colorSetup = { 1: 400, 2: 500, 3: 800, 4: 1000, 5: 1200, 6: 1500, 7: 1700, 8: 1800 };
  CONSTANTS.printWasteA = 6000;
  CONSTANTS.printWasteB = 40;
  CONSTANTS.printWasteC = 50000;
  CONSTANTS.printWasteD = 400;

  renderMaterialPriceTable();
  renderInkPriceTable();
  renderPrintWasteTable();
  renderProfitTable();
  updateLayerDropdowns();
  localStorage.removeItem('lts_material_config');
  showToast('Đã reset tất cả giá về mặc định!', 'success');
}

function populateCPSXInputs() {
  document.getElementById('cfgGhepCPSX').value = dotFmt(CONSTANTS.ghepCPSX);
  document.getElementById('cfgLaborCost').value = dotFmt(CONSTANTS.laborCost);
  document.getElementById('cfgCutBase').value = dotFmt(CONSTANTS.cutBase || 971);
  document.getElementById('cfgNhuPrice').value = dotFmt(CONSTANTS.nhuPrice);
  document.getElementById('cfgMoPrice').value = dotFmt(CONSTANTS.moPrice);
  // Cutting params
  document.getElementById('cfgCutThreshold1').value = CONSTANTS.cutThreshold1 || 0.07;
  document.getElementById('cfgCutThreshold2').value = CONSTANTS.cutThreshold2 || 0.2;
  document.getElementById('cfgCutMult1').value = CONSTANTS.cutMult1 || 1.4;
  document.getElementById('cfgCutMult2').value = CONSTANTS.cutMult2 || 1.2;
  document.getElementById('cfgCutMult3').value = CONSTANTS.cutMult3 || 0.8;
  updateCutPreviews();
}

function updateCutPreviews() {
  const base = CONSTANTS.cutBase || 971;
  const m1 = CONSTANTS.cutMult1 || 1.4;
  const m2 = CONSTANTS.cutMult2 || 1.2;
  const m3 = CONSTANTS.cutMult3 || 0.8;
  const fmt = v => v % 1 === 0 ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  document.getElementById('cutPreview1').textContent = fmt(Math.round(base * m1));
  document.getElementById('cutPreview2').textContent = fmt(Math.round(base * m2));
  document.getElementById('cutPreview3').textContent = fmt(Math.round(base * m3));
}

function updateCPSXConstants() {
  CONSTANTS.ghepCPSX = parseDotFmt(document.getElementById('cfgGhepCPSX').value) || 684;
  CONSTANTS.laborCost = parseDotFmt(document.getElementById('cfgLaborCost').value) || 318;
  CONSTANTS.cutBase = parseDotFmt(document.getElementById('cfgCutBase').value) || 971;
  CONSTANTS.nhuPrice = parseDotFmt(document.getElementById('cfgNhuPrice').value) || 200;
  CONSTANTS.moPrice = parseDotFmt(document.getElementById('cfgMoPrice').value) || 200;
  // Cutting params
  CONSTANTS.cutThreshold1 = parseFloat(document.getElementById('cfgCutThreshold1').value) || 0.07;
  CONSTANTS.cutThreshold2 = parseFloat(document.getElementById('cfgCutThreshold2').value) || 0.2;
  CONSTANTS.cutMult1 = parseFloat(document.getElementById('cfgCutMult1').value) || 1.4;
  CONSTANTS.cutMult2 = parseFloat(document.getElementById('cfgCutMult2').value) || 1.2;
  CONSTANTS.cutMult3 = parseFloat(document.getElementById('cfgCutMult3').value) || 0.8;
  
  // Phụ kiện
  CONSTANTS.zipperPrice = parseDotFmt(document.getElementById('cfgZipperPrice')?.value) || 378;
  CONSTANTS.zipperWeight = parseFloat(document.getElementById('cfgZipperWeight')?.value) || 0;
  CONSTANTS.tapePrice = parseDotFmt(document.getElementById('cfgTapePrice')?.value) || 200;
  CONSTANTS.tapeWeight = parseFloat(document.getElementById('cfgTapeWeight')?.value) || 0;
  CONSTANTS.handlePrice = parseDotFmt(document.getElementById('cfgHandlePrice')?.value) || 650;
  CONSTANTS.handleWeight = parseFloat(document.getElementById('cfgHandleWeight')?.value) || 0;
  updateCutPreviews();
  saveMaterialConfig();
  showToast('Đã cập nhật!', 'success');
}

// Persist to localStorage
function saveMaterialConfig() {
  const data = {
    materials: MATERIALS.map(m => ({
      id: m.id, thickness: m.thickness, pricePerKg: m.pricePerKg, inkPricePerColor: m.inkPricePerColor
    })),
    cpsx: {
      ghepCPSX: CONSTANTS.ghepCPSX,
      laborCost: CONSTANTS.laborCost,
      cutBase: CONSTANTS.cutBase || 971,
      cutThreshold1: CONSTANTS.cutThreshold1,
      cutThreshold2: CONSTANTS.cutThreshold2,
      cutMult1: CONSTANTS.cutMult1,
      cutMult2: CONSTANTS.cutMult2,
      cutMult3: CONSTANTS.cutMult3,
      cylinderPricePerUnit: CONSTANTS.cylinderPricePerUnit,
      nhuPrice: CONSTANTS.nhuPrice,
      moPrice: CONSTANTS.moPrice,
      zipperPrice: CONSTANTS.zipperPrice,
      zipperWeight: CONSTANTS.zipperWeight,
      tapePrice: CONSTANTS.tapePrice,
      tapeWeight: CONSTANTS.tapeWeight,
      handlePrice: CONSTANTS.handlePrice,
      handleWeight: CONSTANTS.handleWeight
    },
    printWaste: {
      colorSetup: CONSTANTS.colorSetup,
      A: CONSTANTS.printWasteA,
      B: CONSTANTS.printWasteB,
      C: CONSTANTS.printWasteC,
      D: CONSTANTS.printWasteD
    },
    profitTable: PROFIT_TABLE.map(row => ({ col1: row.col1, col2: row.col2 }))
  };
  localStorage.setItem('lts_material_config', JSON.stringify(data));
}

function loadMaterialConfig() {
  const saved = localStorage.getItem('lts_material_config');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.materials) {
      data.materials.forEach(saved => {
        const m = MATERIALS.find(x => x.id === saved.id);
        if (m) {
          m.thickness = saved.thickness;
          m.pricePerKg = saved.pricePerKg;
          if (saved.inkPricePerColor != null) m.inkPricePerColor = saved.inkPricePerColor;
          m.pricePerM2 = m.pricePerKg * m.thickness * m.density / 1000;
        }
      });
    }
    if (data.cpsx) {
      CONSTANTS.ghepCPSX = data.cpsx.ghepCPSX;
      CONSTANTS.laborCost = data.cpsx.laborCost ?? data.cpsx.baseCPSX ?? 318;
      CONSTANTS.cutBase = data.cpsx.cutBase;
      if (data.cpsx.cutThreshold1 != null) CONSTANTS.cutThreshold1 = data.cpsx.cutThreshold1;
      if (data.cpsx.cutThreshold2 != null) CONSTANTS.cutThreshold2 = data.cpsx.cutThreshold2;
      if (data.cpsx.cutMult1 != null) CONSTANTS.cutMult1 = data.cpsx.cutMult1;
      if (data.cpsx.cutMult2 != null) CONSTANTS.cutMult2 = data.cpsx.cutMult2;
      if (data.cpsx.cutMult3 != null) CONSTANTS.cutMult3 = data.cpsx.cutMult3;
      if (data.cpsx.cylinderPricePerUnit) CONSTANTS.cylinderPricePerUnit = data.cpsx.cylinderPricePerUnit;
      if (data.cpsx.nhuPrice != null) CONSTANTS.nhuPrice = data.cpsx.nhuPrice;
      if (data.cpsx.moPrice != null) CONSTANTS.moPrice = data.cpsx.moPrice;
      if (data.cpsx.zipperPrice != null) {
        CONSTANTS.zipperPrice = data.cpsx.zipperPrice;
        const eZip = document.getElementById('cfgZipperPrice'); if (eZip) eZip.value = fmt(CONSTANTS.zipperPrice);
      }
      if (data.cpsx.zipperWeight != null) {
        CONSTANTS.zipperWeight = data.cpsx.zipperWeight;
        const eZipW = document.getElementById('cfgZipperWeight'); if (eZipW) eZipW.value = CONSTANTS.zipperWeight;
      }
      if (data.cpsx.tapePrice != null) {
        CONSTANTS.tapePrice = data.cpsx.tapePrice;
        const eTape = document.getElementById('cfgTapePrice'); if (eTape) eTape.value = fmt(CONSTANTS.tapePrice);
      }
      if (data.cpsx.tapeWeight != null) {
        CONSTANTS.tapeWeight = data.cpsx.tapeWeight;
        const eTapeW = document.getElementById('cfgTapeWeight'); if (eTapeW) eTapeW.value = CONSTANTS.tapeWeight;
      }
      if (data.cpsx.handlePrice != null) {
        CONSTANTS.handlePrice = data.cpsx.handlePrice;
        const eHand = document.getElementById('cfgHandlePrice'); if (eHand) eHand.value = fmt(CONSTANTS.handlePrice);
      }
      if (data.cpsx.handleWeight != null) {
        CONSTANTS.handleWeight = data.cpsx.handleWeight;
        const eHandW = document.getElementById('cfgHandleWeight'); if (eHandW) eHandW.value = CONSTANTS.handleWeight;
      }
    }
    // Backward compatibility & new property loads
    if (data.printWaste) {
      if (data.printWaste.colorSetup) CONSTANTS.colorSetup = data.printWaste.colorSetup;
      if (data.printWaste.A != null) CONSTANTS.printWasteA = data.printWaste.A;
      if (data.printWaste.B != null) CONSTANTS.printWasteB = data.printWaste.B;
      if (data.printWaste.C != null) CONSTANTS.printWasteC = data.printWaste.C;
      if (data.printWaste.D != null) CONSTANTS.printWasteD = data.printWaste.D;
    }
    if (data.profitTable && data.profitTable.length === PROFIT_TABLE.length) {
      data.profitTable.forEach((row, idx) => {
        PROFIT_TABLE[idx].col1 = row.col1;
        PROFIT_TABLE[idx].col2 = row.col2;
      });
    }
  } catch (e) { /* ignore corrupt data */ }
}

// ══════════════════════════════════════════════
// QUOTE VIEW RENDER
// ══════════════════════════════════════════════
function renderQuoteView(r) {
  document.getElementById('quoteCustomer').value = r.input.customer === 'N/A' ? '' : r.input.customer;
  document.getElementById('quoteProductName').value = r.input.productName === 'N/A' ? '' : r.input.productName;
  document.getElementById('quoteColors').value = r.input.numColors ? `${r.input.numColors} màu` : 'Không in';
  
  // Format material string
  const mats = [];
  if (r.layers.print) mats.push(r.layers.print.material.name.split(' ')[0]);
  if (r.layers.laminations && r.layers.laminations.length > 0) {
    [...r.layers.laminations].reverse().forEach(lam => mats.push(lam.material.name.split(' ')[0]));
  }
  document.getElementById('quoteMaterial').value = mats.join(' / ');
  
  // Custom thickness (can be modified by user, only set if empty)
  if (!document.getElementById('quoteThickness').value) {
    document.getElementById('quoteThickness').value = r.totalThickness;
  }
  
  // Default sizes from input
  if (!document.getElementById('quoteSize').value) {
    const w = r.input.spreadWidth * 1000;
    const l = r.input.cutStep * 1000;
    document.getElementById('quoteSize').value = `${w.toFixed(0)} x ${l.toFixed(0)} mm`;
  }
  
  // Generate Table Body
  // rows: Túi (productType === 'tui') or Màng (productType === 'mang')
  const isBag = r.input.productType === 'tui';
  const unit = isBag ? 'Túi' : 'Kg';
  const vatRate = isBag ? 8 : 8; // Both 8% as per notes (túi / màng = 8%)
  const vatText = '8%';
  const price = r.finalPrice;
  const qty = r.input.quantity;
  const total = price * qty;
  
  let html = `
    <tr>
      <td>${isBag ? 'Túi bao bì' : 'Màng bao bì'}</td>
      <td class="num">${fmt(qty)}</td>
      <td class="num">${unit}</td>
      <td class="num">${fmt(price)} đ</td>
      <td class="num highlight">${fmt(total)} đ</td>
      <td class="num">${vatText}</td>
    </tr>
  `;
  
  if (r.input.numColors > 0 && r.cylinderCost > 0) {
    html += `
    <tr>
      <td>Trục in (${r.input.numColors} màu)</td>
      <td class="num">1</td>
      <td class="num">Bộ</td>
      <td class="num">${fmt(r.cylinderCost)} đ</td>
      <td class="num highlight">${fmt(r.cylinderCost)} đ</td>
      <td class="num">10%</td>
    </tr>
    `;
  }
  
  document.getElementById('quote-table-body').innerHTML = html;
}
