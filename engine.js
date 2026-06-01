// ============================================================
// ENGINE TÍNH GIÁ - Dựa trên SP2 (A87:Q95) sheet TRANG
// ============================================================

function calculate(input) {
  const {
    quantity, spreadWidth, cutStep, numColors, metallicSurcharge = 0,
    handleWeight = 0, zipperWeight = 0, tapeWeight = 0, coverageRatio = 1, profitColumn = 2,
    commissionRate = 0, hasZipper = false, hasTape = false, hasHandle = false,
    layer1Id, layer2Id, layer3Id, layer4Id, layer5Id,
    shippingPerKm, shippingKm,
    boxPrice, bagsPerBox,
    micOverrides = {}
  } = input;

  // Clone materials to avoid mutating MATERIALS array, and apply mic overrides
  const cloneMat = (mat, layerKey) => {
    if (!mat) return null;
    const clone = { ...mat };
    if (micOverrides[layerKey] && mat.adjustableMic) {
      clone.thickness = micOverrides[layerKey];
      clone.pricePerM2 = clone.pricePerKg * clone.thickness * clone.density / 1000;
    }
    return clone;
  };

  const layer1 = cloneMat(getMaterial(layer1Id), 'layer1');
  const layer2 = layer2Id ? cloneMat(getMaterial(layer2Id), 'layer2') : null;
  const layer3 = layer3Id ? cloneMat(getMaterial(layer3Id), 'layer3') : null;
  const layer4 = layer4Id ? cloneMat(getMaterial(layer4Id), 'layer4') : null;
  const layer5 = layer5Id ? cloneMat(getMaterial(layer5Id), 'layer5') : null;
  if (!layer1) return null; // At minimum, layer1 is required

  // Count active middle layers for waste calculation
  const middleLayers = [layer2, layer3, layer4].filter(Boolean);
  const numLaminations = (layer5 ? 1 : 0) + middleLayers.length; // lamination steps needed

  const numImages = input.numImages || 1;

  // ── 1. KÍCH THƯỚC CƠ BẢN ──
  const bagArea = spreadWidth * cutStep;
  const totalArea = quantity * bagArea;
  // Khổ in = Khổ trải × số con hình + 0.02m biên (nhất quán với bảng kỹ thuật)
  const printWidth = spreadWidth * numImages + 0.02;
  const filmLength = totalArea / printWidth;

  // ── 2. CPSX CẮT ──
  const cutWidth = printWidth;
  const cutMeters = filmLength;
  const cutWaste = cutMeters / 3000 * 20 + 100;
  const cutWastePercent = numLaminations <= 1 ? 3 : 6;

  // ── 3. GHÉP - Build lamination chain from innermost outward ──
  const laminations = [];
  // Track both the layer material and its actual layer number (2-5)
  const lamChain = [
    { layer: layer5, num: 5 }, { layer: layer4, num: 4 },
    { layer: layer3, num: 3 }, { layer: layer2, num: 2 }
  ].filter(item => !!item.layer);
  let currentNeededMeters = cutMeters + cutWaste;

  lamChain.forEach(({ layer, num }) => {
    const width = cutWidth + 0.02;
    const meters = currentNeededMeters;
    const waste = meters / 3000 * 20 + 100;
    const cpsx = CONSTANTS.ghepCPSX;
    const costCPSX = cpsx * (waste + meters) * width;
    const costMat = layer.pricePerM2 * (waste + meters) * width;
    
    laminations.unshift({
      layerNum: num, material: layer, width, meters, waste, cpsx, costCPSX, costMat, total: costCPSX + costMat
    });
    currentNeededMeters = meters + waste;
  });

  const totalLamWaste = laminations.reduce((sum, lam) => sum + lam.waste, 0);
  const totalLamCost = laminations.reduce((sum, lam) => sum + lam.total, 0);

  // ── 4. CPSX IN - Lớp 1 (ngoài) ──
  const printNLWidth = cutWidth + 0.02;
  const printMeters = cutMeters + cutWaste + totalLamWaste;
  // Fallbacks: defaults to the values requested by user if somehow undefined
  const cSetup = numColors > 0 ? (CONSTANTS.colorSetup[numColors] || (numColors * 200 + 200)) : 0; 
  const pA = CONSTANTS.printWasteA || 6000;
  const pB = CONSTANTS.printWasteB || 40;
  const pC = CONSTANTS.printWasteC || 50000;
  const pD = CONSTANTS.printWasteD || 400;
  
  const printWaste = numColors > 0 
    ? (cSetup + (printMeters / pA * pB) + (printMeters > pC ? printMeters / pC * pD : 0)) 
    : 0;
  const inkPrice = layer1.inkPricePerColor || (layer1.isPETorPA ? 135 : 120);
  const printCPSX = numColors > 0 
    ? (numColors * inkPrice * coverageRatio + CONSTANTS.laborCost + metallicSurcharge) 
    : 0;
  const printCostCPSX = printCPSX * (printWaste + printMeters) * printNLWidth;
  const printCostMaterial = layer1.pricePerM2 * (printWaste + printMeters) * printNLWidth;
  const printTotalCost = printCostCPSX + printCostMaterial;

  // ── 5. CPSX CẮT chi phí ──
  let cutCPSX;
  const cutBase = CONSTANTS.cutBase || 971;
  const cutT1 = CONSTANTS.cutThreshold1 || 0.07;
  const cutT2 = CONSTANTS.cutThreshold2 || 0.2;
  const cutM1 = CONSTANTS.cutMult1 || 1.4;
  const cutM2 = CONSTANTS.cutMult2 || 1.2;
  const cutM3 = CONSTANTS.cutMult3 || 0.8;
  if (bagArea < cutT1)           cutCPSX = cutBase * cutM1;
  else if (bagArea < cutT2)      cutCPSX = cutBase * cutM2;
  else                           cutCPSX = cutBase * cutM3;
  const cutCostCPSX = cutCPSX * (cutWaste + cutMeters) * cutWidth;
  const cutTotalCost = cutCostCPSX;

  // ── 6. TỔNG GIÁ VỐN ──
  const totalProductionCost = printTotalCost + totalLamCost + cutTotalCost;

  // ── 7. LỢI NHUẬN ──
  const profitRate = lookupProfit(totalProductionCost, profitColumn);
  const profitAmount = profitRate * totalProductionCost;
  const revenue = totalProductionCost + profitAmount;

  // ── 8. GIÁ VỐN + LN / TÚI ──
  const costPerUnit = revenue / quantity;

  // ── 9. CHI PHÍ PHỤ / TÚI ──
  const rawThickness = layer1.thickness
    + (layer2 ? layer2.thickness : 0)
    + (layer3 ? layer3.thickness : 0)
    + (layer4 ? layer4.thickness : 0)
    + (layer5 ? layer5.thickness : 0);

  const activeLayersCount = 1 + (layer2 ? 1 : 0) + (layer3 ? 1 : 0) + (layer4 ? 1 : 0) + (layer5 ? 1 : 0);
  const addedMic = (activeLayersCount - 1) * 3;
  const totalThickness = Math.round((rawThickness + addedMic) / 5) * 5;

  // Tổng tỉ trọng (g/m²)
  const layerGSM = (thk, dens) => (thk / 1000000) * (dens * 1000000);
  const totalGSM = layerGSM(layer1.thickness, layer1.density)
    + (layer2 ? layerGSM(layer2.thickness, layer2.density) : 0)
    + (layer3 ? layerGSM(layer3.thickness, layer3.density) : 0)
    + (layer4 ? layerGSM(layer4.thickness, layer4.density) : 0)
    + (layer5 ? layerGSM(layer5.thickness, layer5.density) : 0);

  // Các phụ kiện: Zipper, Băng keo, Quai
  const zipperTotal = hasZipper ? (cutMeters + cutWaste) * CONSTANTS.zipperPrice : 0;
  const zipperPerUnit = quantity > 0 ? zipperTotal / quantity : 0;
  const zipperWeightTotal = hasZipper ? (cutMeters + cutWaste) * zipperWeight : 0;

  const tapeTotal = hasTape ? (cutMeters + cutWaste) * CONSTANTS.tapePrice : 0;
  const tapePerUnit = quantity > 0 ? tapeTotal / quantity : 0;
  const tapeWeightTotal = hasTape ? (cutMeters + cutWaste) * tapeWeight : 0;

  const handleTotal = hasHandle ? quantity * CONSTANTS.handlePrice : 0;
  const handlePerUnit = hasHandle ? CONSTANTS.handlePrice : 0;

  const extraAccessoryWeightPerUnit = quantity > 0 ? (zipperWeightTotal + tapeWeightTotal) / quantity : 0;

  // Thùng giấy
  const actualBagsPerBox = bagsPerBox || 0;
  const actualBoxPrice = boxPrice || 0;
  const numBoxes = actualBagsPerBox > 0 ? quantity / actualBagsPerBox : 0;
  const boxTotal = actualBoxPrice * numBoxes;
  const boxPerUnit = quantity > 0 ? boxTotal / quantity : 0;

  // Tare (gr/cái) = Tổng tỉ trọng (g/m²) × diện tích túi (m²)
  const tareWeight = totalGSM * bagArea + handleWeight + extraAccessoryWeightPerUnit;

  // Vận chuyển
  const actualShippingPerKm = shippingPerKm || 0;
  const actualShippingKm = shippingKm || 0;
  const shippingRate = actualShippingPerKm * actualShippingKm;
  const totalWeightTons = tareWeight * quantity / 1000000;
  const shippingTotal = totalWeightTons * shippingRate;
  const shippingPerUnit = quantity > 0 ? shippingTotal / quantity : 0;

  // Lãi vay — direct rate from payment term selection
  const paymentDays = input.paymentDays || 30;
  const interestRate30 = input.paymentInterestRate || 0.0025;
  const interestPerUnit = interestRate30 * costPerUnit;

  // Hoa hồng — supports % rate or fixed VND per unit
  const commissionFixedVND = input.commissionFixedVND || 0;
  let commissionPerUnit;
  if (commissionFixedVND > 0) {
    commissionPerUnit = commissionFixedVND;
  } else {
    commissionPerUnit = commissionRate * costPerUnit;
  }

  // ── 10. GIÁ CUỐI ──
  const finalPrice = costPerUnit + zipperPerUnit + tapePerUnit + handlePerUnit + boxPerUnit
    + shippingPerUnit + interestPerUnit + commissionPerUnit;

  // ── 11. TRỤC IN (manual input) ──
  const cylLength = input.cylLength || 0.63;
  const cylCircum = input.cylCircum || 0.4;
  const cylUnitPrice = input.cylUnitPrice || CONSTANTS.cylinderPricePerUnit;
  const cylArea = cylLength * cylCircum;
  const cylinderCostPerUnit = cylArea * cylUnitPrice;
  const cylinderCost = cylinderCostPerUnit * numColors;

  // ── 12. THỜI GIAN SX ──
  const productionDays = Math.ceil(quantity / 30000) + 4;

  // ── 13. CẤU TRÚC TEXT ──
  let structureText = layer1.name + ' ' + layer1.thickness;
  if (layer2) structureText += '//' + layer2.name + ' ' + layer2.thickness;
  if (layer3) structureText += '//' + layer3.name + ' ' + layer3.thickness;
  if (layer4) structureText += '//' + layer4.name + ' ' + layer4.thickness;
  if (layer5) structureText += '//' + layer5.name + ' ' + layer5.thickness;

  return {
    // Đầu vào
    input,
    structureText,
    totalThickness,
    totalGSM,

    // Kích thước
    bagArea, totalArea, printWidth, filmLength,
    cutWidth, cutMeters, cutWaste, cutWastePercent, cutCPSX, cutCostCPSX, cutTotalCost,

    // In
    printNLWidth, printMeters, printWaste, printCPSX, printCostCPSX, printCostMaterial, printTotalCost,

    // Tổng hợp
    totalProductionCost, totalLamCost, profitRate, profitAmount, revenue,
    costPerUnit,

    // Phụ phí
    zipperPerUnit, zipperTotal, tapePerUnit, tapeTotal, handlePerUnit, handleTotal,
    boxPerUnit, boxTotal, actualBoxPrice, actualBagsPerBox, numBoxes,
    tareWeight, shippingPerUnit, shippingTotal, shippingRate,
    actualShippingPerKm, actualShippingKm,
    interestPerUnit, interestRate30, paymentDays,
    commissionPerUnit,

    // Kết quả
    finalPrice,
    cylinderCost,
    cylinderCostPerUnit,
    cylArea,
    cylLength,
    cylCircum,
    productionDays,

    // Chi tiết layers
    layers: {
      print: { material: layer1, width: printNLWidth, meters: printMeters, waste: printWaste, cpsx: printCPSX, costCPSX: printCostCPSX, costMat: printCostMaterial, total: printTotalCost },
      laminations, // Array of laminated layers from outermost (Layer 2) to innermost
      cut: { width: cutWidth, meters: cutMeters, waste: cutWaste, cpsx: cutCPSX, costCPSX: cutCostCPSX, total: cutTotalCost },
    }
  };
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtVND(n) { return fmt(n) + ' đ'; }
function fmtPercent(n) { 
  const val = n * 100;
  // Use minimal decimal places needed (trim trailing zeros)
  return parseFloat(val.toFixed(2)) + '%';
}
function fmtM(n) { return fmt(n, 2) + ' m'; }
function fmtM2(n) { return fmt(n, 4) + ' m²'; }

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveHistory(entry) {
  const history = JSON.parse(localStorage.getItem('lts_history') || '[]');
  entry.id = Date.now();
  entry.date = new Date().toLocaleString('vi-VN');
  history.unshift(entry);
  if (history.length > 50) history.pop();
  localStorage.setItem('lts_history', JSON.stringify(history));
}
function getHistory() {
  return JSON.parse(localStorage.getItem('lts_history') || '[]');
}
function clearHistory() {
  localStorage.removeItem('lts_history');
}
