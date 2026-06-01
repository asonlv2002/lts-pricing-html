// ============================================================
// DATABASE NGUYÊN LIỆU - Lấy từ Data2023 sheet
// ============================================================
const MATERIALS = [
  { id: 'PET', name: 'PET', density: 1.4, thickness: 12, pricePerKg: 37037, isPETorPA: true, rollLength: 6000, inkPricePerColor: 140 },
  { id: 'PA', name: 'PA', density: 1.16, thickness: 15, pricePerKg: 83333, isPETorPA: true, rollLength: 6000, inkPricePerColor: 140 },
  { id: 'LLDPE', name: 'LLDPE', density: 0.925, thickness: 105, pricePerKg: 60000, isPETorPA: false, adjustableMic: true, rollLength: 6000, inkPricePerColor: 140 },
  { id: 'LLDPE Sua', name: 'LLDPE sữa', density: 0.990, thickness: 65, pricePerKg: 39000, isPETorPA: false, rollLength: 6000, inkPricePerColor: 140 },
  { id: 'BOPP18', group: 'BOPP', name: 'BOPP', density: 0.91, thickness: 18, pricePerKg: 46296, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'BOPP20', group: 'BOPP', name: 'BOPP', density: 0.91, thickness: 20, pricePerKg: 46296, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'BOPP30', group: 'BOPP', name: 'BOPP', density: 0.91, thickness: 30, pricePerKg: 43519, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'BOPP40', group: 'BOPP', name: 'BOPP', density: 0.91, thickness: 40, pricePerKg: 34722, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'MattOPP18', group: 'Matt OPP', name: 'Matt OPP', density: 0.88, thickness: 18, pricePerKg: 42593, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'MattOPP20', group: 'Matt OPP', name: 'Matt OPP', density: 0.88, thickness: 20, pricePerKg: 50926, isPETorPA: false, rollLength: 4000, inkPricePerColor: 120 },
  { id: 'CPP20', group: 'CPP', name: 'CPP', density: 0.92, thickness: 20, pricePerKg: 38426, isPETorPA: false, rollLength: 6000, inkPricePerColor: 120 },
  { id: 'CPP25', group: 'CPP', name: 'CPP', density: 0.92, thickness: 25, pricePerKg: 38426, isPETorPA: false, rollLength: 6000, inkPricePerColor: 120 },
  { id: 'CPP30', group: 'CPP', name: 'CPP', density: 0.92, thickness: 30, pricePerKg: 38426, isPETorPA: false, rollLength: 6000, inkPricePerColor: 120 },
  { id: 'CPP40', group: 'CPP', name: 'CPP', density: 0.92, thickness: 40, pricePerKg: 39352, isPETorPA: false, rollLength: 6000, inkPricePerColor: 120 },
  { id: 'CPP50', group: 'CPP', name: 'CPP', density: 0.92, thickness: 50, pricePerKg: 41667, isPETorPA: false, rollLength: 6000, inkPricePerColor: 0 },
  { id: 'MCPP25', group: 'MCPP', name: 'MCPP', density: 0.91, thickness: 25, pricePerKg: 55556, isPETorPA: false, rollLength: 6000, inkPricePerColor: 0 },
  { id: 'MCPP50', group: 'MCPP', name: 'MCPP', density: 0.91, thickness: 50, pricePerKg: 55556, isPETorPA: false, rollLength: 6000, inkPricePerColor: 0 },
  { id: 'MPET', name: 'MPET', density: 1.4, thickness: 12, pricePerKg: 48148, isPETorPA: false, rollLength: 6000, inkPricePerColor: 0 },
];

// Tính giá VNĐ/m² = pricePerKg × thickness × density / 1000
MATERIALS.forEach(m => {
  m.pricePerM2 = m.pricePerKg * m.thickness * m.density / 1000;
});



// ============================================================
// BẢNG LỢI NHUẬN - Kết hợp Data2023 + TRANG S66:X73
// col1 = Túi thường (3,4 biên, 2 lớp)
// col2 = Túi zip, đáy đứng, 3 lớp
// ============================================================
const PROFIT_TABLE = [
  { threshold: 9900000, col1: 0.53, col2: 0.83 },
  { threshold: 19000000, col1: 0.25, col2: 0.45 },
  { threshold: 30000000, col1: 0.20, col2: 0.30 },
  { threshold: 40000000, col1: 0.14, col2: 0.23 },
  { threshold: 60000000, col1: 0.11, col2: 0.22 },
  { threshold: 80000000, col1: 0.11, col2: 0.21 },
  { threshold: 100000000, col1: 0.105, col2: 0.20 },
  { threshold: 150000000, col1: 0.10, col2: 0.19 },
  { threshold: 200000000, col1: 0.10, col2: 0.19 },
  { threshold: 300000000, col1: 0.09, col2: 0.18 },
  { threshold: 400000000, col1: 0.08, col2: 0.18 },
  { threshold: 600000000, col1: 0.08, col2: 0.18 },
];
const PROFIT_TABLE_DEFAULTS = PROFIT_TABLE.map(row => ({...row}));
const PROFIT_DEFAULT = { col1: 0.04, col2: 0.11 };

// ============================================================
// HẰNG SỐ
// ============================================================
const CONSTANTS = {
  zipperPrice: 378,            // VNĐ/m (=360*1.05)
  zipperWeight: 0,             // Gr/m
  tapePrice: 200,              // VNĐ/m (Băng keo)
  tapeWeight: 0,               // Gr/m
  handlePrice: 650,            // VNĐ/cái (Quai)
  handleWeight: 0,             // Gr/cái (Quai)
  boxPriceDefault: 18000,      // VNĐ/thùng (mặc định)
  bagsPerBoxDefault: 1000,     // túi/thùng (mặc định)
  interestRate: 0.10,          // 10%/năm
  paymentDays: 30,             // ngày thanh toán
  cylinderPricePerUnit: 7300000, // VNĐ/đơn vị trục
  ghepCPSX: 684,               // CPSX ghép cố định/m
  shippingPerKmDefault: 5000,  // VNĐ/km/tấn (mặc định)
  shippingKmDefault: 200,      // km mặc định
  laborCost: 318,               // Chi phí nhân công (đ)
  cutBase: 971,                // CPSX cắt cơ bản
  cutThreshold1: 0.07,         // Ngưỡng diện tích nhỏ (m²)
  cutThreshold2: 0.2,          // Ngưỡng diện tích trung bình (m²)
  cutMult1: 1.4,               // Hệ số cắt diện tích < threshold1
  cutMult2: 1.2,               // Hệ số cắt threshold1 <= diện tích < threshold2
  cutMult3: 0.8,               // Hệ số cắt diện tích >= threshold2
  nhuPrice: 200,               // Phụ phí nhũ (đ)
  moPrice: 200,                // Phụ phí phủ mờ (đ)

  // Thông số tính phi hao in
  colorSetup: { 1: 400, 2: 500, 3: 800, 4: 1000, 5: 1200, 6: 1500, 7: 1700, 8: 1800 },
  printWasteA: 6000,           // Mẫu số khi tính định mức CD màng cơ bản
  printWasteB: 40,             // Hệ số (mét bù) khi tính định mức CD màng cơ bản
  printWasteC: 50000,          // Ngưỡng CD màng lớn bị cộng thêm
  printWasteD: 400,            // Số mét cộng thêm theo ngưỡng C
};

// ============================================================
// HÀM LOOKUP
// ============================================================
function getMaterial(id) {
  return MATERIALS.find(m => m.id === id) || null;
}

function lookupProfit(totalCost, column) {
  const col = column === 1 ? 'col1' : 'col2';
  let val = PROFIT_DEFAULT[col];
  for (const row of PROFIT_TABLE) {
    if (totalCost < row.threshold) {
      val = row[col];
      break;
    }
  }
  const cgDropdown = document.getElementById('configCustomerGroup');
  if (cgDropdown && cgDropdown.value === 'svlg') {
    val -= 0.03;
  }
  return val;
}
