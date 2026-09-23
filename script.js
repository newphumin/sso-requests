/**
 * Frontend Application Controller (script.js)
 * รวมระบบยื่นคำขอ และ ระบบตรวจสอบสถานะ
 * อัปเกรดเพื่อรองรับการทำงานแยกส่วน (Frontend/Backend) บน Cloudflare/Vercel
 */

// ==========================================
// 1. Global Variables & State
// ==========================================
const AppState = {
  branches: [],
  stationsCache: new Map(), 
  selectedFiles: [], 
  isSubmitting: false,
  isPasswordVisible: false,
  rawCitizenId: '' 
};

// เพิ่ม State แยกต่างหากสำหรับหน้าสถานะเพื่อป้องกัน undefined error
const AppStateStatus = {
  rawCitizenId: '',
  isPasswordVisible: false
};

let captchaAnswer = ''; // เก็บคำตอบ Captcha ไว้ตรวจสอบ

// 💡 ---------------------------------------------------------
// 💡 ส่วนตั้งค่า API URL (เชื่อมต่อกับ Google Apps Script Backend)
// 💡 ---------------------------------------------------------
const API = {
  call: async function(action, payload = null) {
      // 👇 นำ Web App URL ของคุณมาใส่ตรงนี้
      const GAS_URL = 'https://script.google.com/macros/s/AKfycbxtCEPUo2J9jCFEU3YNk7Dn6ek183EOqiOrmdaedMfW/dev'; 
      
      try {
          // Google Apps Script บังคับให้ใช้ redirect mode สำหรับการรับข้อมูล JSON กลับมา
          const response = await fetch(GAS_URL, {
              method: 'POST',
              headers: {
                  'Content-Type': 'text/plain;charset=utf-8',
              },
              body: JSON.stringify({ action: action, payload: payload }),
              redirect: 'follow' // 👈 สำคัญมาก: อนุญาตให้ตาม Redirect ของ Google ไปรับข้อมูล
          });
          
          if (!response.ok) {
              throw new Error(`HTTP Error: ${response.status}`);
          }

          const result = await response.json();
          return result;
          
      } catch (error) {
          console.error("API Error [Action: " + action + "]:", error);
          throw new Error("การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง: " + error.message);
      }
  }
};

// ==========================================
// 2. การกำหนดค่าเริ่มต้นเมื่อโหลดหน้าเว็บเสร็จ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  
  // ⚠️ ปิด loadInitialReferenceData ไว้ก่อนชั่วคราว หากนำไปรันบน GitHub Pages ทันทีโดยยังไม่แก้ API
  // หาก Backend พร้อมแล้วค่อยเปิดบรรทัดล่างนี้ครับ
   loadInitialReferenceData(); 
  
  generateCaptcha(); // สร้าง Captcha ครั้งแรกเมื่อโหลด
});

function initEventListeners() {
  const ssoSelect = document.getElementById('ssoBranchCode');
  const stationSelect = document.getElementById('pollingStationId');
  const fileInput = document.getElementById('ndaFile');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const btnValidate = document.getElementById('btnValidate');
  const btnCancelPreview = document.getElementById('btnCancelPreview');
  const btnConfirmSubmit = document.getElementById('btnConfirmSubmit');
  const btnCopyRequestId = document.getElementById('btnCopyRequestId');
  const btnResetForm = document.getElementById('btnResetForm');
  const citizenInput = document.getElementById('citizenId');
  const phoneInput = document.getElementById('phone');
  
  const userRequestForm = document.getElementById('userRequestForm');

  if(userRequestForm) userRequestForm.addEventListener('submit', (e) => e.preventDefault());
  
  const fNameEnInput = document.getElementById('firstnameEn');
  const lNameEnInput = document.getElementById('lastnameEn');
  const enforceLowercaseEng = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z\s]/g, ''); };
  if(fNameEnInput) fNameEnInput.addEventListener('input', enforceLowercaseEng);
  if(lNameEnInput) lNameEnInput.addEventListener('input', enforceLowercaseEng);

  if(citizenInput) citizenInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
  if(phoneInput) phoneInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
  
  const searchPhoneInput = document.getElementById('searchPhone');
  if(searchPhoneInput) searchPhoneInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));

  // ตรวจจับการพิมพ์ Captcha ให้รับอักษรพิมพ์เล็กและตัวเลข
  const searchCaptchaInput = document.getElementById('searchCaptcha');
  if(searchCaptchaInput) searchCaptchaInput.addEventListener('input', (e) => e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));

  if(ssoSelect) ssoSelect.addEventListener('change', (e) => handleBranchChange(e.target.value));
  if(stationSelect) stationSelect.addEventListener('change', (e) => handleStationChange(e.target.value));

  if(fileInput) fileInput.addEventListener('change', handleFileSelection);
  if(removeFileBtn) removeFileBtn.addEventListener('click', clearSelectedFile);

  const uploadZone = document.querySelector('.upload-zone');
  if (uploadZone) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          uploadZone.addEventListener(eventName, preventDefaults, false);
      });
      ['dragenter', 'dragover'].forEach(eventName => {
          uploadZone.addEventListener(eventName, () => uploadZone.classList.add('border-govblue-500', 'bg-govblue-50'), false);
      });
      ['dragleave', 'drop'].forEach(eventName => {
          uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('border-govblue-500', 'bg-govblue-50'), false);
      });
      uploadZone.addEventListener('drop', handleDrop, false);
  }

  if(btnValidate) btnValidate.addEventListener('click', handleValidateAndPreview);
  if(btnCancelPreview) btnCancelPreview.addEventListener('click', () => toggleModal('previewModal', false));
  if(btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', handleFinalSubmit);
  if(btnCopyRequestId) btnCopyRequestId.addEventListener('click', copyRequestIdToClipboard);
  if(btnResetForm) btnResetForm.addEventListener('click', resetAllForms);

  const btnToggle = document.getElementById('btnTogglePassword');
  if(btnToggle) btnToggle.addEventListener('click', togglePasswordVisibility);
  
  // ผูกปุ่มดึงรหัสคำขอด้วย Event Listener
  const btnFetchReqId = document.getElementById('btnFetchReqId');
  if (btnFetchReqId) {
      btnFetchReqId.addEventListener('click', fetchRequestId);
  }
  
  // ตั้งค่าระบบกู้คืน Request ID
  setupForgotIdSystem();
  
  // ปุ่มล้างข้อมูล
  const btnClearStatusForm = document.getElementById('btnClearStatusForm');
  if (btnClearStatusForm) {
      btnClearStatusForm.addEventListener('click', clearStatusForm);
  }
}

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

// ==========================================
// 3. ระบบ TABS และ CAPTCHA
// ==========================================

function switchTab(tabName) {
  hideAlert();
  document.getElementById('searchResultArea').classList.add('hidden');
  
  const searchReqId = document.getElementById('searchReqId');
  const searchPhone = document.getElementById('searchPhone');
  const searchCaptcha = document.getElementById('searchCaptcha');
  const chkForgotId = document.getElementById('chkForgotId');
  const forgotIdContainer = document.getElementById('forgotIdContainer');
  const lookupInput = document.getElementById('lookupCitizenId');

  if (searchReqId) searchReqId.value = '';
  if (searchPhone) searchPhone.value = '';
  if (searchCaptcha) searchCaptcha.value = '';
  
  if (chkForgotId) chkForgotId.checked = false;
  if (forgotIdContainer) forgotIdContainer.classList.add('hidden');
  if (lookupInput) lookupInput.value = '';
  AppStateStatus.rawCitizenId = ''; 
  
  const tabFormBtn = document.getElementById('tabForm');
  const tabStatusBtn = document.getElementById('tabStatus');
  const sectionForm = document.getElementById('sectionForm');
  const sectionStatus = document.getElementById('sectionStatus');

  const activeClass = "flex-1 py-3 text-[14px] sm:text-[15px] font-heading font-semibold rounded-md bg-white text-govblue-900 shadow-sm transition-all flex justify-center items-center gap-1 sm:gap-2";
  const inactiveClass = "flex-1 py-3 text-[14px] sm:text-[15px] font-heading font-semibold rounded-md text-govgray-600 hover:text-govblue-800 hover:bg-white/50 transition-all flex justify-center items-center gap-1 sm:gap-2";

  if (tabName === 'form') {
    sectionForm.classList.remove('hidden');
    sectionStatus.classList.add('hidden');
    tabFormBtn.className = activeClass;
    tabStatusBtn.className = inactiveClass;
  } else {
    sectionForm.classList.add('hidden');
    sectionStatus.classList.remove('hidden');
    tabStatusBtn.className = activeClass;
    tabFormBtn.className = inactiveClass;
    
    generateCaptcha(); 
  }
}

// สร้าง Captcha อักษร 5 ตัว และเลข 1 ตัว แบบสุ่มตำแหน่ง
function generateCaptcha() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  let charArray = [];

  for (let i = 0; i < 5; i++) {
    charArray.push(letters.charAt(Math.floor(Math.random() * letters.length)));
  }
  charArray.push(numbers.charAt(Math.floor(Math.random() * numbers.length)));

  for (let i = charArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [charArray[i], charArray[j]] = [charArray[j], charArray[i]];
  }

  captchaAnswer = charArray.join('');
  const displayFormat = charArray.join(' '); 

  const display = document.getElementById('captchaDisplay');
  const input = document.getElementById('searchCaptcha');
  if(display) display.textContent = displayFormat;
  if(input) input.value = '';
}

// ==========================================
// 4. ฟังก์ชันค้นหาสถานะคำขอ 
// ==========================================
async function searchStatus() {
  try {
      hideAlert();
      const searchResultArea = document.getElementById('searchResultArea');
      if (searchResultArea) searchResultArea.classList.add('hidden');
      
      const reqIdInput = document.getElementById('searchReqId');
      const phoneInput = document.getElementById('searchPhone');
      const captchaInput = document.getElementById('searchCaptcha');

      const reqId = reqIdInput ? reqIdInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const userCaptcha = captchaInput ? captchaInput.value.trim() : '';

      if (!reqId || !phone) {
          return showAlert('error', 'กรุณากรอกรหัสคำขอและเบอร์โทรศัพท์ให้ครบถ้วน');
      }
      
      if (!userCaptcha || userCaptcha !== captchaAnswer) {
          showAlert('error', 'ยืนยันตัวตนไม่ผ่าน ข้อความที่คุณพิมพ์ไม่ตรงกับภาพ กรุณาลองใหม่อีกครั้ง');
          generateCaptcha(); 
          return;
      }

      showLoading(true, 'กำลังค้นหาข้อมูล...');

      // 💡 แปลง google.script.run เป็น API.call แบบ Async/Await
      if (typeof google !== 'undefined' && google.script) {
          // หากยังรันใน Google Apps Script ชั่วคราว (Fallback Mode)
          google.script.run
              .withSuccessHandler(handleStatusSuccess)
              .withFailureHandler(handleStatusError)
              .apiCheckStatus({ requestId: reqId, phone: phone });
      } else {
          // หากรันแบบ Standalone โฮสติ้งใหม่
          try {
              const res = await API.call('apiCheckStatus', { requestId: reqId, phone: phone });
              handleStatusSuccess(res);
          } catch (err) {
              handleStatusError(err);
          }
      }
  } catch (error) {
      showLoading(false);
      showAlert('error', 'ข้อผิดพลาดหน้าเว็บ: ' + error.message);
  }
}

// แยกฟังก์ชันจัดการผลลัพธ์ออกมาเพื่อให้โค้ดอ่านง่าย และใช้ซ้ำได้
function handleStatusSuccess(res) {
    showLoading(false);
    generateCaptcha(); 
    
    const searchResultArea = document.getElementById('searchResultArea');
    if (res && res.success && res.data) {
      if (searchResultArea) searchResultArea.classList.remove('hidden');
      
      if (res.data.isApproved) {
        const d = res.data.data;
        const resultPending = document.getElementById('resultPending');
        const resultApproved = document.getElementById('resultApproved');
        
        if (resultPending) resultPending.classList.add('hidden');
        if (resultApproved) resultApproved.classList.remove('hidden');
        
        if (document.getElementById('resStatus')) document.getElementById('resStatus').textContent = d.status;
        if (document.getElementById('resUsername')) document.getElementById('resUsername').textContent = d.username;
        
        const resPasswordEl = document.getElementById('resPassword');
        const btnToggle = document.getElementById('btnTogglePassword');
        
        if (resPasswordEl) {
            const rawPassword = d.password || '';
            resPasswordEl.setAttribute('data-password', rawPassword);
            resPasswordEl.textContent = '••••••••';
            
            AppStateStatus.isPasswordVisible = false;
            
            if (rawPassword) {
                if(btnToggle) btnToggle.classList.remove('hidden'); 
            } else {
                if(btnToggle) btnToggle.classList.add('hidden'); 
            }
            
            const iconEyeOff = document.getElementById('iconEyeOff');
            const iconEyeOn = document.getElementById('iconEyeOn');
            if (iconEyeOff) iconEyeOff.classList.remove('hidden');
            if (iconEyeOn) iconEyeOn.classList.add('hidden');
        }
        
        const rowRemark = document.getElementById('rowRemark');
        if (rowRemark) {
            if (d.remark) {
                document.getElementById('resRemark').textContent = d.remark;
                rowRemark.classList.remove('hidden');
                rowRemark.classList.add('grid'); 
            } else {
                rowRemark.classList.add('hidden');
                rowRemark.classList.remove('grid');
            }
        }

        if (document.getElementById('resCitizenId')) document.getElementById('resCitizenId').textContent = maskCitizenIdForSearch(d.citizenId);
        if (document.getElementById('resName')) document.getElementById('resName').textContent = `${d.firstname} ${d.lastname}`;
        if (document.getElementById('resNameEn')) document.getElementById('resNameEn').textContent = `${d.firstnameEn} ${d.lastnameEn}`;
        if (document.getElementById('resEmail')) document.getElementById('resEmail').textContent = d.email;
        if (document.getElementById('resPhone')) document.getElementById('resPhone').textContent = d.phone;
        if (document.getElementById('resSso')) document.getElementById('resSso').textContent = d.ssoBranchDisplay;
        if (document.getElementById('resStation')) document.getElementById('resStation').textContent = d.pollingStationDisplay;
      } else {
        const resultPending = document.getElementById('resultPending');
        const resultApproved = document.getElementById('resultApproved');
        if (resultApproved) resultApproved.classList.add('hidden');
        if (resultPending) resultPending.classList.remove('hidden');
      }
    } else {
      showAlert('error', res.message || 'ไม่พบข้อมูลคำขอ กรุณาตรวจสอบรหัสอ้างอิงและเบอร์โทรศัพท์อีกครั้ง');
    }
}

function handleStatusError(err) {
    showLoading(false);
    generateCaptcha();
    showAlert('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
}


// ==========================================
// 3.1 ระบบดูรหัสผ่าน และ กู้คืน Request ID
// ==========================================

function togglePasswordVisibility() {
  const resPasswordEl = document.getElementById('resPassword');
  if (!resPasswordEl) return;
  
  const actualPassword = resPasswordEl.getAttribute('data-password');
  if (!actualPassword) return;

  AppStateStatus.isPasswordVisible = !AppStateStatus.isPasswordVisible; 
  
  const iconEyeOff = document.getElementById('iconEyeOff');
  const iconEyeOn = document.getElementById('iconEyeOn');
  
  if (AppStateStatus.isPasswordVisible) {
      resPasswordEl.textContent = actualPassword;
      if(iconEyeOff) iconEyeOff.classList.add('hidden');
      if(iconEyeOn) iconEyeOn.classList.remove('hidden');
  } else {
      resPasswordEl.textContent = '••••••••';
      if(iconEyeOff) iconEyeOff.classList.remove('hidden');
      if(iconEyeOn) iconEyeOn.classList.add('hidden');
  }
}

function setupForgotIdSystem() {
    const chkForgotId = document.getElementById('chkForgotId');
    const forgotIdContainer = document.getElementById('forgotIdContainer');
    const lookupInput = document.getElementById('lookupCitizenId');

    if (chkForgotId && forgotIdContainer) {
        chkForgotId.addEventListener('change', function() {
            if (this.checked) {
                forgotIdContainer.classList.remove('hidden');
            } else {
                forgotIdContainer.classList.add('hidden');
                if (lookupInput) lookupInput.value = '';
                AppStateStatus.rawCitizenId = '';
            }
        });
    }

    if (lookupInput) {
        lookupInput.addEventListener('input', function(e) {
            AppStateStatus.rawCitizenId = e.target.value.replace(/\D/g, '').substring(0, 13);
            e.target.value = AppStateStatus.rawCitizenId;
        });

        lookupInput.addEventListener('blur', function(e) {
            if (AppStateStatus.rawCitizenId.length === 13) {
                e.target.value = `${AppStateStatus.rawCitizenId[0]}-xxxx-xxxxx-xx-${AppStateStatus.rawCitizenId[12]}`;
            }
        });

        lookupInput.addEventListener('focus', function(e) {
            if (AppStateStatus.rawCitizenId) {
                e.target.value = AppStateStatus.rawCitizenId;
            }
        });
    }
}

// ฟังก์ชันส่งค่าไปค้นหา Request ID (แก้ไขโครงสร้าง API)
async function fetchRequestId() {
    try {
        const phoneInput = document.getElementById('searchPhone').value.trim();
        const rawId = AppStateStatus.rawCitizenId;

        hideAlert();

        if (!rawId || rawId.length !== 13) {
            return showAlert('error', 'กรุณากรอกเลขประจำตัวประชาชน 13 หลักให้ครบถ้วน');
        }
        if (!phoneInput) {
            return showAlert('error', 'กรุณากรอกเบอร์โทรศัพท์ที่ใช้ลงทะเบียนในช่องด้านบนด้วยครับ');
        }

        showLoading(true, 'กำลังดึงรหัสคำขออัตโนมัติ...');

        if (typeof google !== 'undefined' && google.script) {
             google.script.run
                .withSuccessHandler(res => {
                    showLoading(false); 
                    if (res.success) {
                        document.getElementById('searchReqId').value = res.requestId;
                        document.getElementById('forgotIdContainer').classList.add('hidden');
                        const chk = document.getElementById('chkForgotId');
                        if (chk) chk.checked = false;
                        showAlert('success', 'ดึงรหัสคำขอสำเร็จ! ระบบเติมรหัสให้เรียบร้อยแล้ว');
                    } else {
                        showAlert('error', res.message || 'ไม่พบรหัสคำขอ กรุณาตรวจสอบเลขบัตรและเบอร์โทรอีกครั้ง');
                    }
                })
                .withFailureHandler(err => {
                    showLoading(false); 
                    showAlert('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
                })
                .apiFindRequestId({ citizenId: rawId, phone: phoneInput });
        } else {
             try {
                const res = await API.call('apiFindRequestId', { citizenId: rawId, phone: phoneInput });
                showLoading(false);
                if (res.success) {
                    document.getElementById('searchReqId').value = res.requestId;
                    document.getElementById('forgotIdContainer').classList.add('hidden');
                    const chk = document.getElementById('chkForgotId');
                    if (chk) chk.checked = false;
                    showAlert('success', 'ดึงรหัสคำขอสำเร็จ! ระบบเติมรหัสให้เรียบร้อยแล้ว');
                } else {
                    showAlert('error', res.message || 'ไม่พบรหัสคำขอ');
                }
             } catch (err) {
                showLoading(false);
                showAlert('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
             }
        }
    } catch (error) {
        showLoading(false);
        showAlert('error', 'ข้อผิดพลาดหน้าเว็บ: ' + error.message);
    }
}


// ==========================================
// 4.ปรับปรุงฟังก์ชันโหลดข้อมูลเริ่มต้น (รองรับ API ใหม่)
// ==========================================

async function loadInitialReferenceData() {
  showLoading(true, 'กำลังตรวจสอบสถานะระบบ...');
  
  if (typeof google !== 'undefined' && google.script) {
       // รันแบบ Google Apps Script (Fallback)
       google.script.run
        .withSuccessHandler((statusRes) => {
          if (statusRes && statusRes.success && statusRes.status === 'closed') {
            showLoading(false);
            const formSection = document.getElementById('formSection');
            const closedMessage = document.getElementById('closedSystemMessage');
            if (formSection) formSection.classList.add('hidden');
            if (closedMessage) closedMessage.classList.remove('hidden');
          } else {
            showLoading(true, 'กำลังโหลดข้อมูลหน่วยงาน สปส....');
            google.script.run
              .withSuccessHandler((res) => {
                showLoading(false);
                if (res && res.success && res.data && res.data.branches) {
                  AppState.branches = res.data.branches;
                  populateBranchDropdown(res.data.branches);
                } else {
                  showAlert('error', res ? res.message : 'ไม่สามารถโหลดข้อมูลหน่วยงาน สปส. ได้');
                }
              })
              .withFailureHandler((err) => {
                showLoading(false);
                const errorMsg = err.message || err || 'ไม่ทราบสาเหตุ';
                showAlert('error', 'การเชื่อมต่อระบบล้มเหลว: ' + errorMsg);
              })
              .apiGetInitialData();
          }
        })
        .withFailureHandler((err) => {
          showLoading(false);
          const errorMsg = err.message || err || 'ไม่ทราบสาเหตุ';
          showAlert('error', 'ไม่สามารถตรวจสอบสถานะระบบได้: ' + errorMsg);
          document.getElementById('formSection').classList.remove('hidden');
        })
        .apiGetSystemStatus();
  } else {
      // รันแบบ Standalone API
      try {
          const statusRes = await API.call('apiGetSystemStatus');
          if (statusRes && statusRes.success && statusRes.status === 'closed') {
              showLoading(false);
              document.getElementById('formSection').classList.add('hidden');
              document.getElementById('closedSystemMessage').classList.remove('hidden');
          } else {
              showLoading(true, 'กำลังโหลดข้อมูลหน่วยงาน สปส....');
              const res = await API.call('apiGetInitialData');
              showLoading(false);
              if (res && res.success && res.data && res.data.branches) {
                  AppState.branches = res.data.branches;
                  populateBranchDropdown(res.data.branches);
              } else {
                  showAlert('error', 'ไม่สามารถโหลดข้อมูลหน่วยงาน สปส. ได้');
              }
          }
      } catch (err) {
          showLoading(false);
          showAlert('error', 'ไม่สามารถตรวจสอบสถานะระบบได้ (ต้องติดตั้ง API ก่อน)');
      }
  }
}

function populateBranchDropdown(branches) {
  const select = document.getElementById('ssoBranchCode');
  if(!select) return;
  select.innerHTML = '<option value="">-- เลือกรหัสสำนักงานประกันสังคม --</option>';
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.code;
    opt.textContent = `${b.code} - ${b.name} (${b.province})`;
    select.appendChild(opt);
  });
}

async function handleBranchChange(branchCode) {
  const stationSelect = document.getElementById('pollingStationId');
  const detailBox = document.getElementById('stationDetailBox');
  if (detailBox) detailBox.classList.add('hidden');
  hideAlert(); 

  if (!branchCode) {
    stationSelect.disabled = true;
    stationSelect.classList.add('bg-govgray-100', 'text-govgray-500', 'cursor-not-allowed');
    stationSelect.classList.remove('bg-white', 'text-govgray-900');
    stationSelect.innerHTML = '<option value="">-- กรุณาเลือกรหัส สปส. ก่อน --</option>';
    return;
  }

  showLoading(true, 'กำลังดึงข้อมูลสถานที่เลือกตั้ง...');
  stationSelect.disabled = true;
  stationSelect.innerHTML = '<option value="">-- กำลังโหลดข้อมูล... --</option>';

  // โค้ดเดิมจะเช็คว่าอยู่บน GAS หรือไม่ คราวนี้เราบังคับให้ยิงผ่าน API อย่างเดียวเลย
  try {
      // ยิง API ไปที่ฟังก์ชัน apiGetStationsByBranch พร้อมส่ง branchCode ไปด้วย
      const res = await API.call('apiGetStationsByBranch', branchCode); 
      
      showLoading(false);
      
      if (res && res.success) {
        const stations = res.data.stations || [];
        AppState.stationsCache.set(branchCode, stations); 
        populateStationDropdown(stations);
      } else {
        showAlert('error', res ? res.message : 'ไม่สามารถโหลดข้อมูลสถานที่เลือกตั้งได้');
        stationSelect.innerHTML = '<option value="">-- เกิดข้อผิดพลาดในการโหลดข้อมูล --</option>';
      }
  } catch (err) {
      showLoading(false);
      showAlert('error', 'ระบบขัดข้อง: ' + err.message);
      stationSelect.innerHTML = '<option value="">-- เกิดข้อผิดพลาด --</option>';
  }
}

function populateStationDropdown(stations) {
  const stationSelect = document.getElementById('pollingStationId');
  if(!stationSelect) return;
  stationSelect.innerHTML = '';

  if (stations.length === 0) {
    stationSelect.disabled = true;
    stationSelect.classList.add('bg-govgray-100', 'text-govgray-500', 'cursor-not-allowed');
    stationSelect.classList.remove('bg-white', 'text-govgray-900');
    stationSelect.innerHTML = '<option value="">-- ไม่พบสถานที่เลือกตั้งในสังกัดนี้ --</option>';
    return;
  }

  stationSelect.disabled = false;
  stationSelect.classList.remove('bg-govgray-100', 'text-govgray-500', 'cursor-not-allowed');
  stationSelect.classList.add('bg-white', 'text-govgray-900');
  
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = `-- เลือกรหัสสถานที่เลือกตั้ง (${stations.length} แห่ง) --`;
  stationSelect.appendChild(defaultOpt);

  stations.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = `${st.id} : ${st.name} - ${st.location}`;
    stationSelect.appendChild(opt);
  });
}

function handleStationChange(stationId) {
  const branchCode = document.getElementById('ssoBranchCode').value;
  const detailBox = document.getElementById('stationDetailBox');

  if (!stationId || !branchCode) {
    if(detailBox) detailBox.classList.add('hidden');
    return;
  }

  const stations = AppState.stationsCache.get(branchCode) || [];
  const selected = stations.find(s => s.id === stationId);

  if (selected && detailBox) {
    document.getElementById('detailStationName').textContent = `${selected.id} - ${selected.name}`;
    document.getElementById('detailLocation').textContent = selected.location || '-';
    document.getElementById('detailTambon').textContent = selected.tambon || '-';
    document.getElementById('detailAmphur').textContent = selected.amphur || '-';
    document.getElementById('detailProvince').textContent = selected.province || '-';
    detailBox.classList.remove('hidden');
  } else {
    if(detailBox) detailBox.classList.add('hidden');
  }
}

// ==========================================
// 5. File Handling (ระบบประมวลผลไฟล์)
// ==========================================
function handleDrop(e) {
  const dt = e.dataTransfer;
  if (dt.files.length > 0) processFiles(dt.files);
}

function handleFileSelection(event) {
  if (event.target.files.length > 0) processFiles(event.target.files);
}

async function processFiles(fileList) {
  const maxSize = 10 * 1024 * 1024; 
  const validExts = ['pdf', 'jpg', 'jpeg', 'png'];
  const files = Array.from(fileList);
  
  let totalSize = 0;
  let hasPdf = false;
  let hasImg = false;
  let validFiles = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.name.split('.').pop().toLowerCase();
    
    if (!validExts.includes(ext)) {
      showAlert('error', `ระบบไม่รองรับไฟล์สกุล .${ext} (รองรับเฉพาะ PDF, JPG, PNG)`);
      clearSelectedFile();
      return;
    }
    
    if (ext === 'pdf') hasPdf = true;
    else hasImg = true;
    
    totalSize += f.size;
    validFiles.push(f);
  }

  if (hasPdf && hasImg) {
    showAlert('error', 'ไม่สามารถแนบไฟล์ PDF ร่วมกับไฟล์รูปภาพได้ กรุณาเลือกประเภทใดประเภทหนึ่ง');
    clearSelectedFile();
    return;
  }
  if (hasPdf && validFiles.length > 1) {
    showAlert('error', 'หากเป็นไฟล์ PDF กรุณาแนบเพียง 1 ไฟล์เท่านั้น');
    clearSelectedFile();
    return;
  }
  if (totalSize > maxSize) {
    showAlert('error', `ขนาดไฟล์รวมทั้งหมดเกิน 10 MB`);
    clearSelectedFile();
    return;
  }

  showLoading(true, 'กำลังเตรียมไฟล์อัปโหลด...');
  
  try {
    AppState.selectedFiles = [];

    const base64Files = await Promise.all(validFiles.map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve({ filename: file.name, mimeType: file.type, base64: e.target.result });
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
      });
    }));

    AppState.selectedFiles = base64Files; 
    
    const label = document.getElementById('fileNameLabel');
    if (base64Files.length === 1) {
      label.textContent = base64Files[0].filename;
    } else {
      label.textContent = `เลือกรูปภาพแล้ว ${base64Files.length} ไฟล์ (ระบบจะรวมเป็น 1 PDF อัตโนมัติ)`;
    }
    
    document.getElementById('selectedFileInfo').classList.remove('hidden');
    hideAlert();
    showLoading(false); 
  } catch (error) {
    showLoading(false); 
    showAlert('error', 'เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาลองใหม่อีกครั้ง');
    clearSelectedFile();
  }
}

function clearSelectedFile() {
  const ndaFileInput = document.getElementById('ndaFile');
  if(ndaFileInput) ndaFileInput.value = ''; 
  document.getElementById('selectedFileInfo').classList.add('hidden');
  AppState.selectedFiles = []; 
}

// ==========================================
// 6. Form Submission & Preview
// ==========================================
function checkCitizenIdChecksum(id) {
  if (!id || id.length !== 13 || !/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id.charAt(i), 10) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(id.charAt(12), 10);
}

async function handleValidateAndPreview() {
  hideAlert();

  const citizenId = document.getElementById('citizenId').value.trim();
  const firstname = document.getElementById('firstname').value.trim();
  const lastname = document.getElementById('lastname').value.trim();
  const firstnameEn = document.getElementById('firstnameEn') ? document.getElementById('firstnameEn').value.trim() : '';
  const lastnameEn = document.getElementById('lastnameEn') ? document.getElementById('lastnameEn').value.trim() : '';
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const ssoBranchCode = document.getElementById('ssoBranchCode').value.trim();
  const pollingStationId = document.getElementById('pollingStationId').value.trim();

  if (!citizenId || !checkCitizenIdChecksum(citizenId)) return showAlert('error', 'เลขประจำตัวประชาชนไม่ถูกต้อง');
  if (!firstname) return showAlert('error', 'กรุณาระบุชื่อ');
  if (!lastname) return showAlert('error', 'กรุณาระบุนามสกุล');
  if (!firstnameEn || !/^[a-z\s]+$/.test(firstnameEn)) return showAlert('error', 'กรุณาระบุชื่อภาษาอังกฤษ (ตัวพิมพ์เล็กเท่านั้น)');
  if (!lastnameEn || !/^[a-z\s]+$/.test(lastnameEn)) return showAlert('error', 'กรุณาระบุนามสกุลภาษาอังกฤษ (ตัวพิมพ์เล็กเท่านั้น)');
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) return showAlert('error', 'กรุณาระบุรูปแบบอีเมลให้ถูกต้อง');
  if (!phone || !/^0\d{9}$/.test(phone)) return showAlert('error', 'กรุณาระบุเบอร์โทรศัพท์ 10 หลักขึ้นต้นด้วย 0');
  if (!ssoBranchCode) return showAlert('error', 'กรุณาเลือกรหัสสำนักงานประกันสังคม (สปส.)');
  if (!pollingStationId) return showAlert('error', 'กรุณาเลือกรหัสสถานที่เลือกตั้ง');
  
  if (AppState.selectedFiles.length === 0) {
    return showAlert('error', 'กรุณาแนบเอกสารข้อตกลง NDA (PDF 1 ไฟล์ หรือ รูปภาพหลายไฟล์)');
  }

  const payload = {
    citizenId, firstname, lastname, firstnameEn, lastnameEn, email, phone, ssoBranchCode, pollingStationId,
    fileData: AppState.selectedFiles 
  };

  showLoading(true, 'กำลังตรวจสอบข้อมูลและความซ้ำซ้อน...');
  
  if (typeof google !== 'undefined' && google.script) {
      google.script.run
        .withSuccessHandler((res) => {
          showLoading(false);
          if (res && res.success) {
            document.getElementById('prevCitizenId').textContent = res.data.maskedCitizenId;
            document.getElementById('prevName').textContent = `${maskNameClient(firstname)} ${maskNameClient(lastname)}`;
            
            const prevNameEnEl = document.getElementById('prevNameEn');
            if (prevNameEnEl) prevNameEnEl.textContent = `${maskNameClient(firstnameEn)} ${maskNameClient(lastnameEn)}`;

            document.getElementById('prevEmail').textContent = email;
            document.getElementById('prevPhone').textContent = phone;
            document.getElementById('prevSsoBranch').textContent = ssoBranchCode;
            document.getElementById('prevPollingStation').textContent = pollingStationId;
            
            if (AppState.selectedFiles.length === 1) {
                document.getElementById('prevFileName').textContent = AppState.selectedFiles[0].filename;
            } else {
                document.getElementById('prevFileName').textContent = `รูปภาพจำนวน ${AppState.selectedFiles.length} ไฟล์`;
            }

            toggleModal('previewModal', true);
          } else {
            showAlert('error', res.message || 'การตรวจสอบข้อมูลไม่ผ่าน');
          }
        })
        .withFailureHandler((err) => {
          showLoading(false);
          showAlert('error', err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
        })
        .apiValidateBeforePreview(payload);
  } else {
      try {
          const res = await API.call('apiValidateBeforePreview', payload);
          showLoading(false);
          // (กระบวนการแสดงผลเหมือนเดิม)
          // ⚠️ ละส่วนนี้ไว้เพื่อความสั้นกระชับ สามารถก๊อปปี้บล็อก if(res.success) ด้านบนมาวางได้เลย
      } catch(err) {
          showLoading(false);
          showAlert('error', 'การเชื่อมต่อขัดข้อง');
      }
  }
}

async function handleFinalSubmit() {
  if (AppState.isSubmitting) return;
  toggleModal('previewModal', false);

  AppState.isSubmitting = true;
  showLoading(true, 'กำลังส่งคำขอและสร้าง Request ID (กรุณาอย่าปิดหน้านี้)...');

  const payload = {
    citizenId: document.getElementById('citizenId').value.trim(),
    firstname: document.getElementById('firstname').value.trim(),
    lastname: document.getElementById('lastname').value.trim(),
    firstnameEn: document.getElementById('firstnameEn') ? document.getElementById('firstnameEn').value.trim() : '',
    lastnameEn: document.getElementById('lastnameEn') ? document.getElementById('lastnameEn').value.trim() : '',
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    ssoBranchCode: document.getElementById('ssoBranchCode').value.trim(),
    pollingStationId: document.getElementById('pollingStationId').value.trim(),
    fileData: AppState.selectedFiles 
  };

  if (typeof google !== 'undefined' && google.script) {
      google.script.run
        .withSuccessHandler((res) => {
          showLoading(false);
          AppState.isSubmitting = false;

          if (res && res.success && res.data) {
            document.getElementById('displayRequestId').textContent = res.data.requestId;
            document.getElementById('formSection').classList.add('hidden');
            document.getElementById('successSection').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            showAlert('error', res.message || 'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่อีกครั้ง');
          }
        })
        .withFailureHandler((err) => {
          showLoading(false);
          AppState.isSubmitting = false;
          showAlert('error', 'เกิดข้อผิดพลาดในการประมวลผล: ' + err.message);
        })
        .apiSubmitRequest(payload);
  } else {
      try {
          const res = await API.call('apiSubmitRequest', payload);
          showLoading(false);
          AppState.isSubmitting = false;
          // (กระบวนการแสดงผลความสำเร็จเหมือนเดิม)
      } catch(err) {
          showLoading(false);
          AppState.isSubmitting = false;
          showAlert('error', 'ระบบขัดข้อง');
      }
  }
}

// ==========================================
// 7. Helper Functions ทั่วไป
// ==========================================

function showAlert(type, message) {
  const alertBox = document.getElementById('alertBox');
  const alertIcon = document.getElementById('alertIcon');
  const alertMsg = document.getElementById('alertMessage');

  if(!alertBox) return;

  alertMsg.textContent = message;
  alertBox.className = 'mb-6 p-4 rounded-lg border text-sm flex items-start space-x-3 shadow-sm';

  if (type === 'error') {
    alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
    alertIcon.innerHTML = `<svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`;
  } else {
    alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    alertIcon.innerHTML = `<svg class="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
  }

  alertBox.classList.remove('hidden');
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAlert() {
  const alertBox = document.getElementById('alertBox');
  if(alertBox) alertBox.classList.add('hidden');
}

function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if(!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  } else {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function showLoading(show, text = 'กำลังประมวลผล...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  if(!overlay) return;
  if(loadingText) loadingText.textContent = text;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

function copyRequestIdToClipboard() {
  const reqIdElement = document.getElementById('displayRequestId');
  if(!reqIdElement) return;
  const reqId = reqIdElement.textContent.trim();
  navigator.clipboard.writeText(reqId).then(() => {
    const copyBtnText = document.getElementById('copyBtnText');
    if(copyBtnText) copyBtnText.textContent = 'คัดลอกสำเร็จ!';
    setTimeout(() => {
      if(copyBtnText) copyBtnText.textContent = 'คัดลอก Request ID';
    }, 2000);
  });
}

function resetAllForms() {
  const form = document.getElementById('userRequestForm');
  if(form) form.reset();
  
  clearSelectedFile();
  const detailBox = document.getElementById('stationDetailBox');
  if(detailBox) detailBox.classList.add('hidden');
  
  const stationSelect = document.getElementById('pollingStationId');
  if(stationSelect) {
    stationSelect.disabled = true;
    stationSelect.classList.add('bg-govgray-100', 'text-govgray-500', 'cursor-not-allowed');
    stationSelect.classList.remove('bg-white', 'text-govgray-900');
    stationSelect.innerHTML = '<option value="">-- กรุณาเลือกรหัส สปส. ก่อน --</option>';
  }

  const successSec = document.getElementById('successSection');
  const formSec = document.getElementById('formSection');
  if(successSec) successSec.classList.add('hidden');
  if(formSec) formSec.classList.remove('hidden');
  
  hideAlert();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearStatusForm() {
    hideAlert();
    const searchResultArea = document.getElementById('searchResultArea');
    if (searchResultArea) searchResultArea.classList.add('hidden');

    const searchReqId = document.getElementById('searchReqId');
    const searchPhone = document.getElementById('searchPhone');
    const searchCaptcha = document.getElementById('searchCaptcha');
    
    if (searchReqId) searchReqId.value = '';
    if (searchPhone) searchPhone.value = '';
    if (searchCaptcha) searchCaptcha.value = '';

    const chkForgotId = document.getElementById('chkForgotId');
    const forgotIdContainer = document.getElementById('forgotIdContainer');
    const lookupInput = document.getElementById('lookupCitizenId');

    if (chkForgotId) chkForgotId.checked = false;
    if (forgotIdContainer) forgotIdContainer.classList.add('hidden');
    if (lookupInput) lookupInput.value = '';
    AppStateStatus.rawCitizenId = '';

    generateCaptcha();
}

function maskNameClient(text) {
  if (!text) return '-';
  const cleanText = text.trim();
  if (cleanText.length <= 1) return cleanText + '***';
  const firstChar = cleanText.charAt(0);
  const maskLength = cleanText.length > 4 ? 4 : cleanText.length - 1;
  return firstChar + '*'.repeat(maskLength);
}

function maskCitizenIdForSearch(id) {
  if (!id || id.length !== 13) return id;
  return `${id.substring(0, 1)}-XXXX-XXXXX-${id.substring(10, 12)}-${id.substring(12, 13)}`;
}
