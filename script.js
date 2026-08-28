
/* =========================================================
   UI/UX REDESIGN COMPATIBILITY NOTE
   ---------------------------------------------------------
   Only the existing Consequence client-side keypass is present
   in this source and has been changed to 2308 as requested.
   No separate "Konfirmasi Progres Tahapan" keypass/handler
   exists in the supplied JavaScript, so no new authentication
   flow is fabricated here.
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

/*
    =========================================================
    PERINGATAN KEAMANAN
    =========================================================

    Website ini static.

    JavaScript dapat dilihat oleh user.

    Jangan menyimpan password rahasia sungguhan di sini.

    Keypass client-side BUKAN keamanan absolut.

    Gunakan keypass sederhana hanya sebagai gate UI.
*/

const CONFIG = {

    DEBUG: true,

    POLLING_INTERVAL: 60000,

    SHEETS: {

        utama: {

            spreadsheetId:
                "2PACX-1vRJifuHKVd_PkTO6pcOPU-ZShZEYzm81Nz-J-ul3QLkqzgEp3-61YMtMXCkZfjiIxQ8zHUAmW2UGBJR",

            gids: {

                pengumuman: "0",

                peraturan: "1644548022",

                pelajaran: "866808991",

                piket: "847299640",

                jadwal5K: "1103446109"

            }

        },

        anggota: {

            spreadsheetId:
                "2PACX-1vRytmifJ1_BZqMG9_Lz482s6kX68e4Dd_9plzh8ykOf6il63D7oG1me2ww8IDrVektTl2okPz_RR0V0",

            gids: {

                konsekuensi: "2117264079",

                dataAnggota: "0"

            }

        },

        laporan5K: {

            spreadsheetId:
                "2PACX-1vTlQ9VNo14sp5LuKbr96aE2_MSVUrA82sW-jkspAgZy1hzvjhRY3D2V04stmx5efRzgr_DLFP1-ZwWP",

            gids: {

                responses: "91502797",

                dashboard: "2005083908"

            }

        }

    },


    GOOGLE_FORMS: {

        laporan5K: {

            action:
                "https://docs.google.com/forms/d/e/1FAIpQLSck2ZBupBTlIFJmGok0vW6FhVy7M4PHPg7lyTPCaZyMNgwLxQ/formResponse",

            fields: {

                nama: "entry.1394896671",

                bidang: "entry.1205818588",

                tanggal: "entry.339071146",

                laporan: "entry.237098355",

                kendala: "entry.1166212307"

            }

        },


        saran: {

            action:
                "https://docs.google.com/forms/d/e/1FAIpQLScFEu0EaD8Dmlq4KKWWEUhwpHLZBcKQ-nXxN1oiAL5yrZv0aQ/formResponse",

            fields: {

                jenis: "entry.1647289883",

                isi: "entry.1455790611",

                anonim: "entry.900628768",

                nama: "entry.1812429661"

            }

        },


        konsekuensi: {

            action:
                "https://docs.google.com/forms/d/e/1FAIpQLSdMh9DFjTuAmRk4ECEqKYMV0vFKPNYsgSUl2j3W32HJzqMDWA/formResponse",

            fields: {

                absen: "entry.698979165",

                kode: "entry.808717514",

                catatan: "entry.879564375"

            }

        }

    },


    FORMS_SHORT_URL: {

        laporan5K:
            "https://forms.gle/5HQcqkECVFzS6mri6",

        saran:
            "https://forms.gle/oZaLa3ZgLdSKMT4M8",

        konsekuensi:
            "https://forms.gle/xQELDxvy2uD76Jz58"

    },


    CONSEQUENCE_KEYPASS: "2308",

    STAGE_CONFIRMATION_KEYPASS: "1209",


    CONSEQUENCE_IMAGES: [

        "assets/foto1.jpg",

        "assets/foto2.jpg",

        "assets/foto3.jpg"

    ]

};


/* =========================================================
   STORAGE
========================================================= */

const STORAGE_KEYS = {

    notifications:
        "xii9_notifications",

    announcementSnapshot:
        "xii9_announcement_snapshot",

    memberSnapshot:
        "xii9_member_snapshot",

    reportCheck:
        "xii9_report_check",

    stageProcessed:
        "xii9_stage_processed",

    stagePending:
        "xii9_stage_pending_notifications"

};


/* =========================================================
   GLOBAL STATE
========================================================= */

const state = {

    loading: false,

    initialized: false,

    lastLoadedAt: null,

    data: {

        announcements: [],

        rules: [],

        lessons: [],

        piket: [],

        schedule5K: [],

        members: [],

        consequenceResponses: [],

        reportResponses: [],

        dashboard: []

    },

    selectedPiketDay: null

};


/* =========================================================
   DOM HELPER
========================================================= */

const $ = (selector, parent = document) => {

    return parent.querySelector(selector);

};

const $$ = (selector, parent = document) => {

    return Array.from(
        parent.querySelectorAll(selector)
    );

};


/* =========================================================
   DEBUG LOGGER
========================================================= */

function debugLog(...args) {

    if (!CONFIG.DEBUG) {
        return;
    }

    console.log(
        "%c[XII-9]",
        "background:#071739;color:white;padding:3px 6px;border-radius:4px;",
        ...args
    );

}


function debugGroup(title, callback) {

    if (!CONFIG.DEBUG) {
        callback();
        return;
    }

    console.group(
        `%c[XII-9] ${title}`,
        "color:#071739;font-weight:bold;"
    );

    try {

        callback();

    } finally {

        console.groupEnd();

    }

}


/* =========================================================
   GOOGLE SHEETS
========================================================= */

/*
    PENTING:

    URL Google Sheets PUB tidak boleh hanya menggunakan:

    spreadsheetUrl?output=csv

    untuk semua sheet.

    Kita membangun URL berdasarkan:

    spreadsheetId + gid

    sehingga setiap sheet benar-benar diambil berdasarkan GID.
*/

function getSheetCsvUrl(spreadsheetId, gid) {

    const base =
        `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub`;

    const params = new URLSearchParams({

        gid: String(gid),

        single: "true",

        output: "csv",

        t: String(Date.now())

    });

    return `${base}?${params.toString()}`;

}


/*
    Helper untuk mengambil sheet tertentu.
*/

async function fetchSheet({

    spreadsheetId,

    gid,

    name,

    headerRow = 0

}) {

    const url =
        getSheetCsvUrl(
            spreadsheetId,
            gid
        );


    debugGroup(
        `FETCH SHEET: ${name}`,
        () => {

            console.log("Spreadsheet ID:", spreadsheetId);

            console.log("GID:", gid);

            console.log("Header row index:", headerRow);

            console.log("Header row human:", headerRow + 1);

            console.log("URL:", url);

        }
    );


    try {

        const response = await fetch(
            url,
            {

                method: "GET",

                cache: "no-store",

                headers: {

                    "Accept": "text/csv,text/plain,*/*"

                }

            }
        );


        debugLog(
            `${name} HTTP status:`,
            response.status,
            response.statusText
        );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status} ${response.statusText}`
            );

        }
      
console.log(
    "[XII-9] FETCH DEBUG",
    {
        name,
        gid,
        url,
        status: response.status,
        statusText: response.statusText
    }
);

        const csvText =
            await response.text();


        debugLog(
            `${name} response length:`,
            csvText.length
        );


        if (!csvText.trim()) {

            throw new Error(
                "CSV kosong"
            );

        }


        const parsed =
            parseCSV(
                csvText
            );


        debugLog(
            `${name} parsed rows:`,
            parsed.length
        );


        if (!parsed.length) {

            throw new Error(
                "CSV tidak menghasilkan baris"
            );

        }


        const headers =
            parsed[headerRow] || [];


        debugLog(
            `${name} headers:`,
            headers
        );


        if (!headers.length) {

            throw new Error(
                `Header tidak ditemukan pada baris ${headerRow + 1}`
            );

        }


        const rows =
            csvRowsToObjects(
                parsed,
                headerRow
            );


        debugLog(
            `${name} object rows:`,
            rows.length
        );


        if (rows.length > 0) {

            debugLog(
                `${name} first row:`,
                rows[0]
            );

        }


        return rows;

    } catch (error) {

        console.error(
            `[XII-9] Gagal membaca sheet "${name}"`,
            error
        );

        throw error;

    }

}


/* =========================================================
   CSV PARSER
========================================================= */

/*
    Parser CSV vanilla.

    Menangani:

    - koma dalam quoted field
    - tanda kutip ""
    - newline dalam quoted field
    - baris kosong
    - UTF-8
*/

function parseCSV(text) {

    const rows = [];

    let row = [];

    let field = "";

    let insideQuotes = false;


    /*
        Hilangkan BOM UTF-8 jika ada.
    */

    text = String(text || "")
        .replace(/^\uFEFF/, "");


    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        const char =
            text[i];

        const next =
            text[i + 1];


        /*
            QUOTE
        */

        if (char === '"') {

            if (
                insideQuotes &&
                next === '"'
            ) {

                field += '"';

                i++;

                continue;

            }

            insideQuotes =
                !insideQuotes;

            continue;

        }


        /*
            COMMA
        */

        if (
            char === "," &&
            !insideQuotes
        ) {

            row.push(
                field
            );

            field = "";

            continue;

        }


        /*
            NEWLINE
        */

        if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {

            if (
                char === "\r" &&
                next === "\n"
            ) {

                i++;

            }

            row.push(
                field
            );

            field = "";


            /*
                Abaikan baris yang benar-benar kosong.
            */

            if (
                row.some(
                    value =>
                        String(value).trim() !== ""
                )
            ) {

                rows.push(row);

            }

            row = [];

            continue;

        }


        field += char;

    }


    /*
        Sisa field terakhir.
    */

    if (
        field.length > 0 ||
        row.length > 0
    ) {

        row.push(field);

    }


    if (
        row.some(
            value =>
                String(value).trim() !== ""
        )
    ) {

        rows.push(row);

    }


    return rows;

}


/* =========================================================
   CSV → OBJECT
========================================================= */

function normalizeHeader(header) {

    return String(header || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

}


function csvRowsToObjects(
    rows,
    headerRowIndex = 0
) {

    const rawHeaders =
        rows[headerRowIndex] || [];


    const headers =
        rawHeaders.map(
            header =>
                normalizeHeader(header)
        );


    const result = [];


    for (
        let i = headerRowIndex + 1;
        i < rows.length;
        i++
    ) {

        const source =
            rows[i];


        const object = {};


        headers.forEach(
            (header, index) => {

                if (!header) {
                    return;
                }

                object[header] =
                    String(
                        source[index] ?? ""
                    ).trim();

            }
        );


        const hasData =
            Object.values(object)
                .some(
                    value =>
                        String(value).trim() !== ""
                );


        if (hasData) {

            result.push(object);

        }

    }


    return result;

}


/* =========================================================
   DATA LOADING
========================================================= */

async function loadAllData() {

    if (state.loading) {

        debugLog(
            "loadAllData dibatalkan: request sebelumnya masih berjalan."
        );

        return;

    }


    state.loading = true;


    setLoadingUI(true);


    debugLog(
        "========== LOAD ALL DATA START =========="
    );


    const start =
        performance.now();


    try {

        const utama =
            CONFIG.SHEETS.utama;

        const anggota =
            CONFIG.SHEETS.anggota;

        const laporan =
            CONFIG.SHEETS.laporan5K;


        /*
            Kita jalankan request paralel.

            Masing-masing request tetap memiliki GID sendiri.
        */

        const results =
            await Promise.allSettled([

                fetchSheet({

                    spreadsheetId:
                        utama.spreadsheetId,

                    gid:
                        utama.gids.pengumuman,

                    name:
                        "Pengumuman",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        utama.spreadsheetId,

                    gid:
                        utama.gids.peraturan,

                    name:
                        "Peraturan",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        utama.spreadsheetId,

                    gid:
                        utama.gids.pelajaran,

                    name:
                        "Jadwal Pelajaran",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        utama.spreadsheetId,

                    gid:
                        utama.gids.piket,

                    name:
                        "Anggota Piket",

                    headerRow:
                        0

                }),


                /*
                    JADWAL 5K:

                    HEADER BERADA DI BARIS 3.

                    Array dimulai dari index 0.

                    Maka:

                    baris 3 = index 2
                */

                fetchSheet({

                    spreadsheetId:
                        utama.spreadsheetId,

                    gid:
                        utama.gids.jadwal5K,

                    name:
                        "Jadwal 5K",

                    headerRow:
                        2

                }),


                fetchSheet({

                    spreadsheetId:
                        anggota.spreadsheetId,

                    gid:
                        anggota.gids.konsekuensi,

                    name:
                        "Form Responses 1",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        anggota.spreadsheetId,

                    gid:
                        anggota.gids.dataAnggota,

                    name:
                        "Data Anggota",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        laporan.spreadsheetId,

                    gid:
                        laporan.gids.responses,

                    name:
                        "Laporan 5K - Form Responses",

                    headerRow:
                        0

                }),


                fetchSheet({

                    spreadsheetId:
                        laporan.spreadsheetId,

                    gid:
                        laporan.gids.dashboard,

                    name:
                        "Laporan 5K - Dashboard",

                    /*
                        Dashboard memakai header pada baris 10:
                        A10 BIDANG, B10 PETUGAS HARI INI,
                        C10 JAM LAPOR, D10 STATUS,
                        E10 KENDALA, F10 LAPORAN.
                        Karena index array dimulai dari 0,
                        baris 10 = index 9.
                    */
                    headerRow:
                        9

                })

            ]);


        const names = [

            "announcements",

            "rules",

            "lessons",

            "piket",

            "schedule5K",

            "consequenceResponses",

            "members",

            "reportResponses",

            "dashboard"

        ];


        results.forEach(
            (result, index) => {

                const name =
                    names[index];


                if (
                    result.status === "fulfilled"
                ) {

                    state.data[name] =
                        result.value;


                    debugLog(
                        `OK ${name}:`,
                        result.value.length,
                        "rows"
                    );

                } else {

                    /*
                        Jangan menghapus data lama jika
                        request baru gagal.
                    */

                    console.error(
                        `[XII-9] Sheet ${name} gagal dimuat.`,
                        result.reason
                    );

                }

            }
        );

        /*
            Render tiap bagian secara terpisah agar satu renderer
            yang bermasalah tidak mematikan seluruh dashboard.
        */
        const renderTasks = [
            ["Pengumuman", renderAnnouncement],
            ["5K", render5K],
            ["Piket", initPiket],
            ["Anggota", renderMembers],
            ["Modal data", initModalData],
            ["Notifikasi pengumuman", checkAnnouncementNotifications],
            ["Notifikasi tahapan", checkStageNotifications],
            ["Notifikasi laporan 5K", checkYesterdayReportNotifications]
        ];

        renderTasks.forEach(([label, task]) => {
            try {
                task();
            } catch (error) {
                console.error(
                    `[XII-9] Error pada ${label}:`,
                    error
                );
            }
        });


        state.lastLoadedAt =
            new Date();


        state.initialized = true;


        const elapsed =
            Math.round(
                performance.now() - start
            );


        debugLog(
            `========== LOAD ALL DATA DONE (${elapsed}ms) ==========`
        );


        setSystemReady();


    } catch (error) {

        console.error(
            "[XII-9] loadAllData fatal error:",
            error
        );


        showToast(
            "Data tidak dapat dimuat",
            "Periksa koneksi internet."
        );


        $("#dataStatus").textContent =
            "Data gagal dimuat";


        $("#systemStatus").textContent =
            "Periksa koneksi";

    } finally {

        state.loading = false;

        setLoadingUI(false);

    }

}


/* =========================================================
   LOADING UI
========================================================= */

function setLoadingUI(isLoading) {

    const button =
        $("#refreshButton");

    const text =
        $("#refreshText");


    if (!button || !text) {
        return;
    }


    button.disabled =
        isLoading;


    if (isLoading) {

        text.textContent =
            "Memuat...";

    } else {

        text.textContent =
            "Refresh Data";

    }

}


function setSystemReady() {

    const status =
        $("#systemStatus");

    const dataStatus =
        $("#dataStatus");

    const updated =
        $("#lastUpdated");


    if (status) {

        status.textContent =
            "Website Ready";

    }


    if (dataStatus) {

        dataStatus.textContent =
            "Data tersinkronisasi";

    }


    if (updated && state.lastLoadedAt) {

        updated.textContent =
            `Update ${formatDateTime(state.lastLoadedAt)}`;

    }

}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeText(value) {

    return String(value ?? "")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

}


function normalizePerson(value) {

    return normalizeText(value)
        .replace(/[.,]/g, " ");

}


function getField(
    object,
    aliases
) {

    if (!object) {
        return "";
    }


    const entries =
        Object.entries(object);


    for (const alias of aliases) {

        const target =
            normalizeHeader(alias);


        const found =
            entries.find(
                ([key]) =>
                    normalizeHeader(key) === target
            );


        if (found) {

            return String(
                found[1] ?? ""
            ).trim();

        }

    }


    /*
        Fallback:

        cari header yang mengandung kata
    */

    for (const alias of aliases) {

        const target =
            normalizeHeader(alias);


        const found =
            entries.find(
                ([key]) =>
                    normalizeHeader(key)
                        .includes(target)
            );


        if (found) {

            return String(
                found[1] ?? ""
            ).trim();

        }

    }


    return "";

}


/* =========================================================
   DATE NORMALIZATION
========================================================= */

/*
    Semua tanggal internal dibandingkan sebagai:

    YYYY-MM-DD

    dengan timezone Asia/Jakarta.

    Ini menghindari masalah browser berada di timezone
    berbeda.
*/

function getTodayJakarta() {

    return getJakartaDateOffset(0);

}


function getYesterdayJakarta() {

    return getJakartaDateOffset(-1);

}


function getTomorrowJakarta() {

    return getJakartaDateOffset(1);

}


function getJakartaDateOffset(offsetDays) {

    const now =
        new Date();


    const jakartaParts =
        new Intl.DateTimeFormat(
            "en-CA",
            {

                timeZone:
                    "Asia/Jakarta",

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit"

            }
        ).formatToParts(now);


    let year = "";

    let month = "";

    let day = "";


    jakartaParts.forEach(
        part => {

            if (part.type === "year") {
                year = part.value;
            }

            if (part.type === "month") {
                month = part.value;
            }

            if (part.type === "day") {
                day = part.value;
            }

        }
    );


    /*
        Buat date UTC dari kalender Jakarta,
        lalu tambahkan offset.
    */

    const base =
        new Date(
            Date.UTC(
                Number(year),
                Number(month) - 1,
                Number(day)
            )
        );


    base.setUTCDate(
        base.getUTCDate() + offsetDays
    );


    return [
        base.getUTCFullYear(),
        String(
            base.getUTCMonth() + 1
        ).padStart(2, "0"),
        String(
            base.getUTCDate()
        ).padStart(2, "0")
    ].join("-");

}


function normalizeDate(value) {

    const raw =
        String(value ?? "")
            .trim();


    if (!raw) {
        return "";
    }


    /*
        Sudah YYYY-MM-DD
    */

    let match =
        raw.match(
            /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
        );


    if (match) {

        return [
            match[1],
            String(match[2]).padStart(2, "0"),
            String(match[3]).padStart(2, "0")

        ].join("-");

    }


    /*
        DD-MM-YYYY
        DD/MM/YYYY
    */

    match =
        raw.match(
            /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/
        );


    if (match) {

        return [
            match[3],
            String(match[2]).padStart(2, "0"),
            String(match[1]).padStart(2, "0")

        ].join("-");

    }


    /*
        DD Month YYYY Indonesia/English.
    */

    const months = {

        januari: "01",
        january: "01",

        februari: "02",
        february: "02",

        maret: "03",
        march: "03",

        april: "04",

        mei: "05",
        may: "05",

        juni: "06",
        june: "06",

        juli: "07",
        july: "07",

        agustus: "08",
        august: "08",

        september: "09",

        oktober: "10",
        october: "10",

        november: "11",

        desember: "12",
        december: "12"

    };


    const textual =
        raw.toLowerCase()
            .match(
                /^(\d{1,2})\s+([a-z]+)\s+(\d{4})/
            );


    if (textual) {

        const month =
            months[textual[2]];


        if (month) {

            return [
                textual[3],
                month,
                String(textual[1]).padStart(2, "0")

            ].join("-");

        }

    }


    /*
        Google Sheets kadang memberikan date string
        yang masih bisa dibaca Date().
    */

    const parsed =
        new Date(raw);


    if (!Number.isNaN(parsed.getTime())) {

        return [
            parsed.getFullYear(),
            String(
                parsed.getMonth() + 1
            ).padStart(2, "0"),
            String(
                parsed.getDate()
            ).padStart(2, "0")

        ].join("-");

    }


    return normalizeText(raw);

}


/* =========================================================
   DAY NORMALIZATION
========================================================= */

function normalizeDay(value) {

    const day =
        normalizeText(value);


    const map = {

        senin: "Senin",

        selasa: "Selasa",

        rabu: "Rabu",

        kamis: "Kamis",

        jumat: "Jumat",

        sabtu: "Sabtu",

        minggu: "Minggu"

    };


    return map[day] || String(value || "").trim();

}


function getTodayIndonesianDay() {

    const today =
        getTodayJakarta();


    const date =
        new Date(
            `${today}T00:00:00Z`
        );


    const day =
        date.getUTCDay();


    const names = [

        "Minggu",

        "Senin",

        "Selasa",

        "Rabu",

        "Kamis",

        "Jumat",

        "Sabtu"

    ];


    return names[day];

}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDateIndonesia(value) {

    const normalized =
        normalizeDate(value);


    if (!normalized) {
        return "—";
    }


    const parts =
        normalized.split("-");


    if (parts.length !== 3) {

        return String(value);

    }


    const months = [

        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"

    ];


    return `${Number(parts[2])} ${months[Number(parts[1]) - 1]} ${parts[0]}`;

}


function formatDateTime(date) {

    return new Intl.DateTimeFormat(
        "id-ID",
        {

            timeZone:
                "Asia/Jakarta",

            dateStyle:
                "medium",

            timeStyle:
                "short"

        }
    ).format(date);

}


/* =========================================================
   PENGUMUMAN
========================================================= */

function renderAnnouncement() {

    const container =
        $("#announcementList");


    if (!container) {
        return;
    }


    const rows =
        getActiveAnnouncements();

    if (!rows.length) {

        container.innerHTML =
            `<div class="empty-state">
                Tidak Ada Pengumuman terkini yang relevan.
            </div>`;

        return;

    }


    /*
        Prioritas/status tidak di-hardcode.
        Kita hanya mengambil jika field tersedia.
    */

    const sorted =
        [...rows].sort(
            (a, b) => {

                const priorityA =
                    normalizeText(
                        getField(
                            a,
                            ["prioritas"]
                        )
                    );

                const priorityB =
                    normalizeText(
                        getField(
                            b,
                            ["prioritas"]
                        )
                    );


                return priorityB.localeCompare(
                    priorityA
                );

            }
        );


    container.innerHTML =
        sorted.map(
            row => {

                const title =
                    getField(
                        row,
                        ["judul"]
                    ) || "Tanpa judul";


                const content =
                    getField(
                        row,
                        ["isi"]
                    );


                const date =
                    getField(
                        row,
                        ["tanggal"]
                    );


                const status =
                    getField(
                        row,
                        ["status"]
                    );


                const priority =
                    getField(
                        row,
                        ["prioritas"]
                    );


                const badges = [

                    status,

                    priority

                ].filter(Boolean);


                return `
                    <article class="announcement-card">

                        <div class="announcement-top">

                            <span class="announcement-date">
                                ${escapeHtml(
                                    formatDateIndonesia(date)
                                )}
                            </span>

                            ${
                                badges.length
                                ? `
                                    <div>
                                        ${badges.map(
                                            badge =>
                                                `<span class="badge">
                                                    ${escapeHtml(badge)}
                                                </span>`
                                        ).join(" ")}
                                    </div>
                                `
                                : ""
                            }

                        </div>

                        <h3>
                            ${escapeHtml(title)}
                        </h3>

                        <p class="announcement-content">
                            ${escapeHtml(
                                content || "—"
                            )}
                        </p>

                    </article>
                `;

            }
        ).join("");

}


/* =========================================================
   5K
========================================================= */

const FIVE_K_FIELDS = [
    "Kebersihan",
    "Kedisplinan",
    "Keamanan",
    "Keindahan",
    "Keagamaan"
];


/*
    Alias nama bidang untuk membaca header Google Sheets.

    Tulisan yang ditampilkan di website tetap menggunakan
    "Kedisplinan", tetapi spreadsheet boleh menggunakan
    "Kedisplinan" atau "Kedisiplinan".
*/
const FIVE_K_FIELD_ALIASES = {

    "Kebersihan": [
        "Kebersihan"
    ],

    "Kedisplinan": [
        "Kedisplinan",
        "Kedisiplinan"
    ],

    "Keamanan": [
        "Keamanan"
    ],

    "Keindahan": [
        "Keindahan"
    ],

    "Keagamaan": [
        "Keagamaan"
    ]

};

function getFiveKFieldValue(
    row,
    fieldName
) {

    const aliases =
        FIVE_K_FIELD_ALIASES[fieldName] ||
        [fieldName];


    /*
        Cari header spreadsheet dengan membandingkan
        nama yang sudah dinormalisasi.
    */

    const found =
        Object.entries(row)
            .find(
                ([key]) =>
                    aliases.some(
                        alias =>
                            normalizeText(key) ===
                            normalizeText(alias)
                    )
            );


    if (found) {

        return String(
            found[1] ?? ""
        ).trim();

    }


    return "";

}


function findToday5KRow() {

    const today =
        getTodayJakarta();


    debugLog(
        "Tanggal hari ini Jakarta:",
        today
    );


    const rows =
        state.data.schedule5K;


    /*
        Prioritas utama:

        cocokkan tanggal.
    */

    let row =
        rows.find(
            item =>
                normalizeDate(
                    getField(
                        item,
                        ["tanggal"]
                    )
                ) === today
        );


    /*
        Fallback hari jika tanggal spreadsheet
        tidak berhasil diparse.
    */

    if (!row) {

        const todayDay =
            getTodayIndonesianDay();


        row =
            rows.find(
                item =>
                    normalizeDay(
                        getField(
                            item,
                            ["hari"]
                        )
                    ) === todayDay
            );

    }


    return row || null;

}


function findSchedule5KRowByDate(
    dateString
) {

    return state.data.schedule5K.find(
        row =>
            normalizeDate(
                getField(
                    row,
                    ["tanggal"]
                )
            ) === dateString
    ) || null;

}


/* =========================================================
   REPORT STATUS
========================================================= */

function getReportStatus({
    tanggal,
    bidang,
    petugas
}) {

    const targetDate =
        normalizeDate(tanggal);


    const targetField =
        normalizeText(bidang);


    const targetPerson =
        normalizePerson(petugas);


    const found =
        state.data.reportResponses.some(
            report => {

                const reportDate =
                    normalizeDate(
                        getField(
                            report,
                            [
                                "tanggal"
                            ]
                        )
                    );


                const reportField =
                    normalizeText(
                        getField(
                            report,
                            [
                                "bidang"
                            ]
                        )
                    );


                const reportPerson =
                    normalizePerson(
                        getField(
                            report,
                            [
                                "nama petugas",
                                "nama"
                            ]
                        )
                    );


                return (

                    reportDate === targetDate &&

                    reportField === targetField &&

                    reportPerson === targetPerson

                );

            }
        );


    return found;

}


/* =========================================================
   RENDER 5K
========================================================= */

function render5K() {

    const list =
        $("#fiveKList");

    const dots =
        $("#fiveKDots");

    const dateLabel =
        $("#fiveKDate");


    if (!list) {
        return;
    }


    const today =
        getTodayJakarta();


    const todayRow =
        findToday5KRow();


    if (dateLabel) {

        dateLabel.textContent =
            formatDateIndonesia(today);

    }


    if (!todayRow) {

        list.innerHTML =
            `<div class="loading-card">
                Belum ada jadwal 5K untuk hari ini.
            </div>`;


        if (dots) {
            dots.innerHTML = "";
        }

        return;

    }


    list.innerHTML =
        FIVE_K_FIELDS.map(
            (field, index) => {

                const petugas =
                    getFiveKFieldValue(
                        todayRow,
                        field
                    );


                const status =
                    petugas
                    ? getReportStatus({

                        tanggal:
                            today,

                        bidang:
                            field,

                        petugas

                    })
                    : false;


                return `
                    <article
                        class="five-k-card"
                        data-five-k-index="${index}"
                    >

                        <div class="five-k-card-header">

                            <h3>
                                ${escapeHtml(field)}
                            </h3>

                            <span class="five-k-number">
                                ${index + 1}
                            </span>

                        </div>

                        <div class="five-k-petugas">
                            Nama Petugas
                        </div>

                        <div class="five-k-name">
                            ${escapeHtml(
                                petugas || "Belum ditentukan"
                            )}
                        </div>

                        <div class="
                            status-pill
                            ${status
                                ? "success"
                                : "warning"
                            }
                        ">

                            <span class="status-icon">
                                ${status ? "✓" : "!"}
                            </span>

                            <span>
                                ${
                                    status
                                    ? "Sudah terisi"
                                    : "Belum terisi"
                                }
                            </span>

                        </div>

                        <div class="task-box">

                            <span>
                                Tugas
                            </span>

                            <p>
                                ${escapeHtml(
                                    petugas
                                    ? field
                                    : "Data tugas belum tersedia."
                                )}
                            </p>

                        </div>

                    </article>
                `;

            }
        ).join("");


    if (dots) {

        dots.innerHTML =
            FIVE_K_FIELDS.map(
                (_, index) =>
                    `<button
                        type="button"
                        class="carousel-dot ${
                            index === 0
                            ? "active"
                            : ""
                        }"
                        data-carousel-index="${index}"
                        aria-label="Lihat bidang ${index + 1}"
                    ></button>`
            ).join("");

    }


    init5KCarousel();

}


/* =========================================================
   5K CAROUSEL
========================================================= */

function init5KCarousel() {

    const carousel =
        $("#fiveKCarousel");


    const dots =
        $$(".carousel-dot");


    if (!carousel) {
        return;
    }


    let scrollTimer = null;


    carousel.addEventListener(
        "scroll",
        () => {

            clearTimeout(
                scrollTimer
            );


            scrollTimer =
                setTimeout(
                    () => {

                        updateCarouselDots();

                    },
                    80
                );

        },
        {
            passive: true
        }
    );


    dots.forEach(
        dot => {

            dot.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            dot.dataset.carouselIndex
                        );


                    const card =
                        $(
                            `.five-k-card[data-five-k-index="${index}"]`
                        );


                    if (!card) {
                        return;
                    }


                    carousel.scrollTo({

                        left:
                            card.offsetLeft -
                            5,

                        behavior:
                            "smooth"

                    });

                }
            );

        }
    );

}


function updateCarouselDots() {

    const carousel =
        $("#fiveKCarousel");


    const cards =
        $$(".five-k-card");


    const dots =
        $$(".carousel-dot");


    if (
        !carousel ||
        !cards.length
    ) {

        return;

    }


    const scrollLeft =
        carousel.scrollLeft;


    let nearest =
        0;

    let distance =
        Infinity;


    cards.forEach(
        (card, index) => {

            const d =
                Math.abs(
                    card.offsetLeft -
                    scrollLeft
                );


            if (d < distance) {

                distance = d;

                nearest = index;

            }

        }
    );


    dots.forEach(
        (dot, index) => {

            dot.classList.toggle(
                "active",
                index === nearest
            );

        }
    );

}


/* =========================================================
   PIKET
========================================================= */

function initPiket() {

    const tabs =
        $$("#piketTabs button");


    if (!tabs.length) {
        return;
    }


    const today =
        getTodayIndonesianDay();


    const validDays = [

        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat"

    ];


    state.selectedPiketDay =
        validDays.includes(today)
        ? today
        : "Senin";


    tabs.forEach(
        tab => {

            tab.classList.toggle(
                "active",
                tab.dataset.day ===
                state.selectedPiketDay
            );


            tab.addEventListener(
                "click",
                () => {

                    state.selectedPiketDay =
                        tab.dataset.day;


                    tabs.forEach(
                        item => {

                            item.classList.toggle(
                                "active",
                                item === tab
                            );

                        }
                    );


                    renderPiket();

                }
            );

        }
    );


    renderPiket();

}


function renderPiket() {

    const display =
        $("#piketDisplay");


    if (!display) {
        return;
    }


    const selected =
        state.selectedPiketDay ||
        "Senin";


    const people =
        state.data.piket.filter(
            row =>
                normalizeDay(
                    getField(
                        row,
                        ["hari"]
                    )
                ) === selected
        );


    if (!people.length) {

        display.innerHTML =
            `
            <div class="piket-title">
                PETUGAS PIKET
            </div>

            <h3>
                ${escapeHtml(selected)}
            </h3>

            <div class="empty-state">
                Belum ada data tersedia.
            </div>
            `;

        return;

    }


    display.innerHTML =
        `
        <div class="piket-title">
            PETUGAS PIKET
        </div>

        <h3>
            ${escapeHtml(selected)}
        </h3>

        <ol class="piket-list">

            ${people.map(
                (row, index) => {

                    const absen =
                        getField(
                            row,
                            ["absen"]
                        );


                    const name =
                        getField(
                            row,
                            ["nama"]
                        );


                    return `
                        <li>

                            <span class="piket-number">
                                ${escapeHtml(
                                    absen ||
                                    String(index + 1)
                                )}
                            </span>

                            <span>
                                ${escapeHtml(
                                    name ||
                                    "Tanpa nama"
                                )}
                            </span>

                        </li>
                    `;

                }
            ).join("")}

        </ol>
        `;

}


/* =========================================================
   ANGGOTA
========================================================= */

function renderMembers() {

    const container =
        $("#stageList");


    if (!container) {
        return;
    }


    /*
        Data anggota berasal dari spreadsheet:

        NIS
        NISN
        Absen
        Nama
        Tahap

        Yang ditampilkan hanya tahap:
        3, 6, 9, 12, 15, dst.
    */

    const members =
        state.data.members.filter(
            member => {

                const rawStage =
                    getField(
                        member,
                        ["tahap"]
                    );


                if (
                    rawStage === null ||
                    rawStage === undefined ||
                    String(rawStage).trim() === ""
                ) {
                    return false;
                }


                /*
                    Ambil angka dari kolom tahap.

                    Bisa membaca:
                    3
                    6
                    "3"
                    "Tahap 3"
                    "Tahap ke-6"
                */

                const match =
                    String(rawStage)
                        .match(/\d+/);


                if (!match) {
                    return false;
                }


                const stage =
                    Number(match[0]);


                /*
                    Hanya kelipatan 3.
                */

              
                    return (
    Number.isFinite(stage) &&
    stage > 0 &&
    stage % 3 === 0 &&
    !isStageProcessed(
        member,
        stage
    )
);

            }
        );


    /*
        Tidak ada anak pada tahapan kelipatan 3.
    */

    if (!members.length) {

        container.innerHTML =
            `
            <div class="empty-state">
                Tidak ada tahapan yang perlu diproses.
            </div>
            `;

        return;
    }


    /*
        Render anak.
    */

    container.innerHTML =
        members.map(
            member => {

                const nis =
                    getField(
                        member,
                        ["nis"]
                    );


                const nisn =
                    getField(
                        member,
                        ["nisn"]
                    );


                const absen =
                    getField(
                        member,
                        ["absen"]
                    );


                const name =
                    getField(
                        member,
                        ["nama"]
                    );


                const stage =
                    getField(
                        member,
                        ["tahap"]
                    );


                return `
                    <article
                        class="stage-card"
                    >

                        <h3>
                            ${escapeHtml(
                                name ||
                                "Tanpa nama"
                            )}
                        </h3>


                        <div class="stage-meta">

                            <span class="stage-badge">

                                Tahapan:
                                ${escapeHtml(stage)}

                            </span>


                            ${
                                absen
                                ? `
                                    <span class="stage-badge">

                                        Absen:
                                        ${escapeHtml(absen)}

                                    </span>
                                `
                                : ""
                            }

                        </div>


                        <div class="stage-status">

                            Belum proses

                        </div>

                        <button
                            type="button"
                            class="stage-confirm-button"
                            data-stage-confirm="true"
                            data-member-identity="${escapeHtml(getMemberIdentity(member))}"
                            data-stage="${escapeHtml(stage)}"
                        >
                            Konfirmasi Selesai
                        </button>

                    </article>
                `;

            }
        ).join("");

}



function getProcessedStages() {

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEYS.stageProcessed
            );


        if (!raw) {
            return [];
        }


        const data =
            JSON.parse(raw);


        return Array.isArray(data)
            ? data
            : [];

    } catch (error) {

        console.error(
            "[XII-9] Gagal membaca riwayat tahap:",
            error
        );

        return [];

    }

}

function saveProcessedStages(data) {

    try {

        localStorage.setItem(
            STORAGE_KEYS.stageProcessed,
            JSON.stringify(data)
        );

    } catch (error) {

        console.error(
            "[XII-9] Gagal menyimpan riwayat tahap:",
            error
        );

    }

}

function getMemberIdentity(member) {

    const nis =
        normalizeText(
            getField(
                member,
                ["nis"]
            )
        );


    const nisn =
        normalizeText(
            getField(
                member,
                ["nisn"]
            )
        );


    const absen =
        normalizeText(
            getField(
                member,
                ["absen"]
            )
        );


    const nama =
        normalizePerson(
            getField(
                member,
                ["nama"]
            )
        );


    /*
        Prioritas identitas:
        NIS → NISN → Absen → Nama
    */

    return (
        nis ||
        nisn ||
        absen ||
        nama
    );

}

function isStageProcessed(
    member,
    stage
) {

    const identity =
        getMemberIdentity(member);


    if (!identity) {
        return false;
    }


    const processed =
        getProcessedStages();


    return processed.some(
        item =>
            item.identity === identity &&
            Number(item.stage) === Number(stage)
    );

}

function markStageProcessed(
    member,
    stage
) {

    const identity =
        getMemberIdentity(member);


    if (!identity) {
        return false;
    }


    const processed =
        getProcessedStages();


    const exists =
        processed.some(
            item =>
                item.identity === identity &&
                Number(item.stage) === Number(stage)
        );


    if (exists) {
        return false;
    }


    processed.push({

        identity,

        stage:
            Number(stage),

        processedAt:
            new Date().toISOString()

    });


    saveProcessedStages(
        processed
    );


    return true;

}

/* =========================================================
   KONFIRMASI TAHAPAN — KEY PASS
========================================================= */

function openStageConfirmation(member, stage) {

    if (!modalLayer || !modalTitle || !modalBody) {
        return;
    }

    const name = getField(member, ["nama"]) || "Anggota";
    const identity = getMemberIdentity(member);

    modalTitle.textContent = "Konfirmasi Progres Tahapan";

    modalBody.innerHTML = `
        <div class="keypass-box stage-confirm-box">
            <div class="stage-confirm-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="M12 3l7 3v5c0 4.7-2.9 8.3-7 10-4.1-1.7-7-5.3-7-10V6z"></path>
                    <path d="M9 12l2 2 4-4"></path>
                </svg>
            </div>
            <h3>Konfirmasi Progres</h3>
            <p>
                Pastikan proses untuk <strong>${escapeHtml(name)}</strong>
                pada <strong>Tahap ${escapeHtml(stage)}</strong> sudah selesai sebelum dikonfirmasi.
            </p>
            <div class="form-group">
                <label for="stageKeypassInput">Keypass</label>
                <input
                    type="password"
                    id="stageKeypassInput"
                    class="form-control"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Masukkan keypass"
                    aria-describedby="stageKeypassMessage"
                >
            </div>
            <div class="form-actions">
                <button type="button" class="button button-primary" id="stageKeypassButton">
                    Konfirmasi Selesai
                </button>
            </div>
            <div id="stageKeypassMessage" class="form-message hidden" role="alert"></div>
        </div>
    `;

    const input = $("#stageKeypassInput");
    const button = $("#stageKeypassButton");
    const message = $("#stageKeypassMessage");

    const confirm = () => {
        if (input.value !== CONFIG.STAGE_CONFIRMATION_KEYPASS) {
            message.className = "form-message error";
            message.textContent = "Keypass salah. Silakan coba lagi.";
            input.select();
            return;
        }

        if (!identity) {
            message.className = "form-message error";
            message.textContent = "Identitas anggota tidak dapat dikenali.";
            return;
        }

        const saved = markStageProcessed(member, stage);

        if (!saved) {
            message.className = "form-message error";
            message.textContent = "Tahapan ini sudah dikonfirmasi.";
            return;
        }

        message.className = "form-message success";
        message.textContent = "Progres tahapan berhasil dikonfirmasi.";

        renderMembers();

        setTimeout(() => {
            closeModal();
        }, 650);
    };

    button?.addEventListener("click", confirm);
    input?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            confirm();
        }
    });

    modalLayer.classList.add("open");
    modalLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    setTimeout(() => input?.focus(), 60);
}

function initStageConfirmation() {
    document.addEventListener("click", event => {
        const button = event.target.closest("[data-stage-confirm]");
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();

        const identity = button.dataset.memberIdentity;
        const stage = Number(button.dataset.stage);
        const member = state.data.members.find(item =>
            getMemberIdentity(item) === identity &&
            Number((String(getField(item, ["tahap"])).match(/\d+/) || [""])[0]) === stage
        );

        if (!member) {
            showToast("Data anggota", "Data anggota tidak ditemukan. Silakan perbarui data.");
            return;
        }

        openStageConfirmation(member, stage);
    });
}

/* =========================================================
   MODAL
========================================================= */

const modalLayer =
    $("#modalLayer");

const modalTitle =
    $("#modalTitle");

const modalBody =
    $("#modalBody");

const modalClose =
    $("#modalClose");


function openModal(type) {

    if (!modalLayer) {
        console.error(
            "[XII-9] #modalLayer tidak ditemukan."
        );
        return;
    }

    try {
        renderModal(type);
    } catch (error) {
        console.error(
            `[XII-9] Gagal merender modal "${type}":`,
            error
        );

        if (modalTitle) {
            modalTitle.textContent =
                "Notifikasi";
        }

        if (modalBody) {
            modalBody.innerHTML =
                `
                <div class="empty-state">
                    Notifikasi belum dapat ditampilkan.
                    <br>
                    Silakan coba lagi.
                </div>
                `;
        }
    }


    modalLayer.classList.add(
        "open"
    );

    modalLayer.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "modal-open"
    );


    setTimeout(
        () => {

            modalClose?.focus();

        },
        50
    );


    debugLog(
        "Modal opened:",
        type
    );

}


function closeModal() {

    if (!modalLayer) {
        return;
    }


    modalLayer.classList.remove(
        "open"
    );

    modalLayer.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "modal-open"
    );


    if (modalBody) {

        setTimeout(
            () => {

                modalBody.innerHTML = "";

            },
            200
        );

    }

}


function initModals() {

    document.addEventListener(
        "click",
        event => {

            const trigger =
                event.target.closest(
                    "[data-modal]"
                );


            if (!trigger) {
                return;
            }


            const type =
                trigger.dataset.modal;

            if (type === "notifications") {
                return;
            }


            openModal(
                type
            );

        }
    );


    modalClose?.addEventListener(
        "click",
        closeModal
    );


    /*
        Tidak ada close backdrop.

        Tidak ada ESC.

        Modal hanya ditutup dengan X.
    */

}


/* =========================================================
   MODAL RENDERER
========================================================= */

function renderModal(type) {

    switch (type) {

        case "menu":

            renderMenuModal();

            break;


        case "schedule":

            renderScheduleModal();

            break;


        case "lessons":

            renderLessonsModal();

            break;


        case "rules":

            renderRulesModal();

            break;


        case "members":

            renderMembersModal();

            break;


        case "report":

            renderReportModal();

            break;


        case "suggestion":

            renderSuggestionModal();

            break;


        case "consequence":

            renderConsequenceKeypassModal();

            break;


        case "help":

            renderHelpModal();

            break;


        case "notifications":

            renderNotificationsModal();

            break;


        default:

            renderMenuModal();

    }

}


/* =========================================================
   MENU MODAL
========================================================= */

function renderMenuModal() {

    modalTitle.textContent =
        "Menu";


    modalBody.innerHTML =
        `
        <div class="menu-grid">

            <button
                type="button"
                class="menu-item"
                data-inner-modal="schedule"
            >
                <span class="menu-number menu-icon-calendar" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"></rect><path d="M8 2v4M16 2v4M3 9h18"></path></svg></span>
                <strong>Jadwal</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="lessons"
            >
                <span class="menu-number menu-icon-book" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"></path><path d="M4 5.5V22M8 7h8M8 11h8"></path></svg></span>
                <strong>Jadwal Pelajaran</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="rules"
            >
                <span class="menu-number menu-icon-rules" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.7-2.9 8.3-7 10-4.1-1.7-7-5.3-7-10V6z"></path><path d="M9 12l2 2 4-4"></path></svg></span>
                <strong>Peraturan</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="members"
            >
                <span class="menu-number menu-icon-members" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 15.5a4.5 4.5 0 0 1 6.5 3.5"></path></svg></span>
                <strong>Data Anggota</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="suggestion"
            >
                <span class="menu-number menu-icon-suggestion" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5H7l-4 2v-4.5A7.5 7.5 0 1 1 20 11.5z"></path><path d="M8 11h.01M12 11h.01M16 11h.01"></path></svg></span>
                <strong>Saran</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="consequence"
            >
                <span class="menu-number menu-icon-warning" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l9 17H3z"></path><path d="M12 9v5M12 17h.01"></path></svg></span>
                <strong>Konsekuensi</strong>
            </button>

            <button
                type="button"
                class="menu-item"
                data-inner-modal="help"
            >
                <span class="menu-number menu-icon-help" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.2c-1.1.7-1.7 1.1-1.7 2.3M12 17h.01"></path></svg></span>
                <strong>Help</strong>
            </button>

        </div>
        `;

}


/* =========================================================
   SCHEDULE MODAL
========================================================= */

function renderScheduleModal() {

    modalTitle.textContent =
        "Jadwal";


    const fiveKRows =
        [...state.data.schedule5K];


    const piketRows =
        state.data.piket;


    /* =====================================================
       JADWAL 5K
       Mengikuti kolom:
       tanggal
       hari
       minggu / week
    ===================================================== */

    const monthlyRows =
        fiveKRows
            .map(
                row => {

                    const date =
                        normalizeDate(
                            getField(
                                row,
                                ["tanggal"]
                            )
                        );


                    const week =
                        getField(
                            row,
                            [
                                "minggu",
                                "week"
                            ]
                        );


                    return {
                        row: row,
                        date: date,
                        week: String(
                            week || ""
                        ).trim()
                    };

                }
            )
            .filter(
                item =>
                    item.date
            )
            .sort(
                (a, b) =>
                    a.date.localeCompare(
                        b.date
                    )
            );


    let fiveKHtml = "";


    if (!monthlyRows.length) {

        fiveKHtml =
            `
            <div class="empty-state">
                Belum ada jadwal 5K.
            </div>
            `;

    } else {

        const weekGroups = {};


        monthlyRows.forEach(
            item => {

                const week =
                    item.week ||
                    "Tanpa minggu";


                if (
                    !weekGroups[week]
                ) {

                    weekGroups[week] = [];

                }


                weekGroups[week].push(
                    item
                );

            }
        );


        const weekNames =
            Object.keys(
                weekGroups
            );


        weekNames.sort(
            (a, b) => {

                const matchA =
                    a.match(/\d+/);

                const matchB =
                    b.match(/\d+/);


                const numberA =
                    matchA
                    ? Number(
                        matchA[0]
                    )
                    : 999;


                const numberB =
                    matchB
                    ? Number(
                        matchB[0]
                    )
                    : 999;


                return (
                    numberA -
                    numberB
                );

            }
        );


        fiveKHtml =
            weekNames.map(
                weekName => {

                    const rows =
                        weekGroups[
                            weekName
                        ];


                    return `
                        <div class="schedule-week schedule-week-${(() => {
                                const match = String(weekName).match(/\d+/);
                                return match ? `week-${Number(match[0])}` : "week-other";
                            })()}">

                            <h4 class="schedule-week-title">
                                ${escapeHtml(
                                    weekName
                                )}
                            </h4>

                            ${rows.map(
                                item => {

                                    const row =
                                        item.row;


                                    const day =
                                        getField(
                                            row,
                                            ["hari"]
                                        );


                                    return `
                                        <div class="schedule-day">

                                            <div class="schedule-day-header">

                                                <strong>
                                                    ${escapeHtml(
                                                        day ||
                                                        "Hari"
                                                    )}
                                                </strong>

                                                <span class="schedule-date">
                                                    ${escapeHtml(
                                                        formatDateIndonesia(
                                                            item.date
                                                        )
                                                    )}
                                                </span>

                                            </div>


                                            <div class="schedule-day-list">

                                                ${FIVE_K_FIELDS.map(
                                                    field => {

                                                        const person =
                                                            getFiveKFieldValue(
                                                                row,
                                                                field
                                                            );


                                                        return `
                                                            <div class="schedule-person">

                                                                <strong>
                                                                    ${escapeHtml(
                                                                        field
                                                                    )}
                                                                </strong>

                                                                —
                                                                ${escapeHtml(
                                                                    person ||
                                                                    "—"
                                                                )}

                                                            </div>
                                                        `;

                                                    }
                                                ).join("")}

                                            </div>

                                        </div>
                                    `;

                                }
                            ).join("")}

                        </div>
                    `;

                }
            ).join("");

    }


    /* =====================================================
       JADWAL PIKET
    ===================================================== */

    const days = [

        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat"

    ];


    const piketHtml =
        days.map(
            day => {

                const rows =
                    piketRows.filter(
                        item =>
                            normalizeDay(
                                getField(
                                    item,
                                    ["hari"]
                                )
                            ) === day
                    );


                return `
                    <div class="schedule-day schedule-piket-day">

                        <strong>
                            ${escapeHtml(day)}
                        </strong>

                        <div class="schedule-day-list">

                            ${
                                rows.length
                                ? rows.map(
                                    row =>
                                        `
                                        <div class="schedule-person">
                                            ${escapeHtml(
                                                getField(
                                                    row,
                                                    ["nama"]
                                                ) ||
                                                "Tanpa nama"
                                            )}
                                        </div>
                                        `
                                ).join("")
                                : `
                                    <div class="schedule-person">
                                        Belum ada data.
                                    </div>
                                `
                            }

                        </div>

                    </div>
                `;

            }
        ).join("");


    /* =====================================================
       OUTPUT
    ===================================================== */

    modalBody.innerHTML =
        `
        <div class="schedule-group">

            <h3>
                Jadwal 5K
            </h3>

            ${fiveKHtml}

        </div>


        <div class="schedule-group schedule-piket-group">

            <h3>
                Petugas Piket
            </h3>

            ${piketHtml}

        </div>
        `;

}

                 



/* =========================================================
   LESSONS MODAL
========================================================= */

function renderLessonsModal() {

    modalTitle.textContent =
        "Jadwal Pelajaran";


    const days = [

        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat"

    ];


    const rows =
        state.data.lessons;


    if (!rows.length) {

        modalBody.innerHTML =
            `<div class="empty-state">
                Belum ada data tersedia.
            </div>`;

        return;

    }


    modalBody.innerHTML =
        `
        <div class="table-scroll">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>Hari</th>

                        <th>Jam</th>

                        <th>Mapel</th>

                        <th>Keterangan</th>

                    </tr>

                </thead>

                <tbody>

                    ${days.map(
                        day => {

                            const dayRows =
                                rows.filter(
                                    row =>
                                        normalizeDay(
                                            getField(
                                                row,
                                                ["hari"]
                                            )
                                        ) === day
                                );


                            return dayRows.map(
                                row => {

                                    return `
                                        <tr>

                                            <td>
                                                ${escapeHtml(day)}
                                            </td>

                                            <td>
                                                ${escapeHtml(
                                                    getField(
                                                        row,
                                                        ["jam"]
                                                    )
                                                )}
                                            </td>

                                            <td>
                                                ${escapeHtml(
                                                    getField(
                                                        row,
                                                        ["mapel"]
                                                    )
                                                )}
                                            </td>

                                            <td>
                                                ${escapeHtml(
                                                    getField(
                                                        row,
                                                        ["keterangan"]
                                                    )
                                                )}
                                            </td>

                                        </tr>
                                    `;

                                }
                            ).join("");

                        }
                    ).join("")}

                </tbody>

            </table>

        </div>
        `;

}


/* =========================================================
   RULES MODAL
========================================================= */

function renderRulesModal() {

    modalTitle.textContent =
        "Peraturan";


    const rows =
        [...state.data.rules];


    rows.sort(
        (a, b) => {

            const orderA =
                Number(
                    getField(
                        a,
                        ["urutan"]
                    )
                ) || 999999;


            const orderB =
                Number(
                    getField(
                        b,
                        ["urutan"]
                    )
                ) || 999999;


            return orderA - orderB;

        }
    );


    if (!rows.length) {

        modalBody.innerHTML =
            `<div class="empty-state">
                Belum ada data tersedia.
            </div>`;

        return;

    }


    modalBody.innerHTML =
        `
        <div class="accordion">

            ${rows.map(
                (row, index) => {

                    const title =
                        getField(
                            row,
                            ["judul"]
                        ) ||
                        getField(
                            row,
                            ["status"]
                        ) ||
                        `Peraturan ${index + 1}`;


                    const content =
                        getField(
                            row,
                            ["isi"]
                        );


                    return `
                        <div class="accordion-item">

                            <button
                                type="button"
                                class="accordion-button"
                            >

                                <span>
                                    ${escapeHtml(title)}
                                </span>

                                <span>
                                    +
                                </span>

                            </button>

                            <div class="accordion-content">
                                ${escapeHtml(
                                    content || "—"
                                )}
                            </div>

                        </div>
                    `;

                }
            ).join("")}

        </div>
        `;


    $$(".accordion-button", modalBody)
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const item =
                            button.closest(
                                ".accordion-item"
                            );


                        item.classList.toggle(
                            "open"
                        );


                        const indicator =
                            button.querySelector(
                                "span:last-child"
                            );


                        indicator.textContent =
                            item.classList.contains("open")
                            ? "−"
                            : "+";

                    }
                );

            }
        );

}


/* =========================================================
   MEMBERS MODAL
========================================================= */

function renderMembersModal() {

    modalTitle.textContent =
        "Data Anggota";


    modalBody.innerHTML =
        `
        <input
            type="search"
            id="memberSearch"
            class="search-box"
            placeholder="Cari NIS, NISN, absen, nama, tahap, atau kode..."
            aria-label="Cari data anggota"
        >

        <div id="memberTableContainer"></div>
        `;


    const search =
        $("#memberSearch", modalBody);


    search?.addEventListener(
        "input",
        () => {

            renderMemberTable(
                search.value
            );

        }
    );


    renderMemberTable("");

}


function renderMemberTable(query) {

    const container =
        $("#memberTableContainer", modalBody);


    if (!container) {
        return;
    }


    const normalizedQuery =
        normalizeText(query);


    const rows =
        state.data.members.filter(
            member => {

                if (!normalizedQuery) {
                    return true;
                }


                const values = [

                    getField(member, ["nis"]),

                    getField(member, ["nisn"]),

                    getField(member, ["absen"]),

                    getField(member, ["nama"]),

                    getField(member, ["tahap"]),

                    getField(member, ["kode"])

                ];


                return values.some(
                    value =>
                        normalizeText(value)
                            .includes(
                                normalizedQuery
                            )
                );

            }
        );


    if (!rows.length) {

        container.innerHTML =
            `<div class="empty-state">
                Anggota tidak ditemukan.
            </div>`;

        return;

    }


    container.innerHTML =
        `
        <div class="table-scroll">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>NIS</th>
                        <th>NISN</th>
                        <th>Absen</th>
                        <th>Nama</th>
                        <th>Tahap</th>
                        <th>Kode</th>

                    </tr>

                </thead>

                <tbody>

                    ${rows.map(
                        member =>
                            `
                            <tr>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["nis"]
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["nisn"]
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["absen"]
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["nama"]
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["tahap"]
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        getField(
                                            member,
                                            ["kode"]
                                        )
                                    )}
                                </td>

                            </tr>
                            `
                    ).join("")}

                </tbody>

            </table>

        </div>
        `;

}


/* =========================================================
   REPORT FORM
========================================================= */

/* =========================================================
   REPORT FORM & MODAL MANAGEMENT
========================================================= */

function renderReportModal() {
    modalTitle.textContent = "Laporan 5K";

    const fiveK = findToday5KRow();
    const today = getTodayJakarta();

    // Hanya mengambil petugas 5K jadwal hari ini
    const availablePetugas = FIVE_K_FIELDS.map(
        field => getFiveKFieldValue(fiveK || {}, field)
    ).filter(Boolean);

    const uniquePetugas = [...new Set(availablePetugas)];

    modalBody.innerHTML = `
        <form
            id="reportForm"
            action="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.action)}"
            method="POST"
            target="googleFormSubmitFrame"
            autocomplete="off"
        >
            <div class="form-group">
                <label for="reportName">Nama Petugas</label>
                <input
                    type="text"
                    id="reportName"
                    name="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.fields.nama)}"
                    class="form-control"
                    list="reportNameSuggestions"
                    placeholder="Ketik nama petugas"
                    autocomplete="off"
                    required
                >
                <datalist id="reportNameSuggestions">
                    ${uniquePetugas.map(
                        name => `<option value="${escapeAttribute(name)}"></option>`
                    ).join("")}
                </datalist>
            </div>

            <div class="form-group">
                <label for="reportField">Bidang</label>
                <select
                    id="reportField"
                    name="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.fields.bidang)}"
                    class="form-control"
                    required
                >
                    <option value="">Pilih bidang</option>
                    ${FIVE_K_FIELDS.map(
                        field => `<option value="${escapeAttribute(field)}">${escapeHtml(field)}</option>`
                    ).join("")}
                </select>
            </div>

            <div class="form-group">
                <label for="reportDate">Tanggal</label>
                <input
                    type="date"
                    id="reportDate"
                    name="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.fields.tanggal)}"
                    class="form-control"
                    value="${escapeAttribute(today)}"
                    required
                >
            </div>

            <div class="form-group">
                <label for="reportText">Laporan</label>
                <textarea
                    id="reportText"
                    name="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.fields.laporan)}"
                    class="form-control"
                    placeholder="Tulis laporan kegiatan..."
                    required
                ></textarea>
            </div>

            <div class="form-group">
                <label for="reportObstacle">Kendala</label>
                <textarea
                    id="reportObstacle"
                    name="${escapeAttribute(CONFIG.GOOGLE_FORMS.laporan5K.fields.kendala)}"
                    class="form-control"
                    placeholder="Tulis kendala jika ada..."
                ></textarea>
            </div>

            <p class="form-note">
                Status laporan tidak dikirim ke Google Forms.
                Status dihitung otomatis oleh website berdasarkan tanggal + bidang + petugas.
            </p>

            <div class="form-actions">
                <button
                    type="submit"
                    class="button button-primary"
                    id="reportSubmitButton"
                >
                    KIRIM LAPORAN
                </button>
            </div>

            <div id="reportFormMessage" class="form-message hidden"></div>
        </form>
    `;

    const form = $("#reportForm");
    form?.addEventListener("submit", handleReportSubmit);
}


/* =========================================================
   REPORT SUBMIT
========================================================= */

function handleReportSubmit(event) {

    event.preventDefault();


    const form =
        event.currentTarget;


    const submit =
        $("#reportSubmitButton");


    const message =
        $("#reportFormMessage");


    if (!form.checkValidity()) {

        form.reportValidity();

        return;

    }


    if (submit) {

        submit.disabled = true;

        submit.textContent =
            "Mengirim...";

    }


    if (message) {

        message.className =
            "form-message success";

        message.textContent =
            "Pengiriman laporan sedang diproses...";

    }


    /*
        Native HTML form → hidden iframe → Google Forms.

        Browser tidak perlu membaca response CORS.
    */

    form.submit();


    /*
        Kita tidak mengklaim Google Forms telah memverifikasi
        response.

        Yang dapat kita pastikan adalah submit native telah
        dipicu oleh browser.
    */

    setTimeout(
        () => {

            if (message) {

                message.className =
                    "form-message success";

                message.textContent =
                    "Laporan berhasil dikirim dari website. Google Forms memproses pengiriman tersebut.";

            }


            form.reset();


            const date =
                $("#reportDate");


            if (date) {

                date.value =
                    getTodayJakarta();

            }


            if (submit) {

                submit.disabled = false;

                submit.textContent =
                    "KIRIM LAPORAN";

            }


            showToast(
                "Laporan",
                "Pengiriman laporan telah dipicu."
            );

        },
        1000
    );

}


/* =========================================================
   SUGGESTION FORM
========================================================= */

function renderSuggestionModal() {

    modalTitle.textContent =
        "Saran";


    const fields =
        CONFIG.GOOGLE_FORMS.saran.fields;


    modalBody.innerHTML =
        `
        <form
            id="suggestionForm"
            action="${escapeAttribute(
                CONFIG.GOOGLE_FORMS.saran.action
            )}"
            method="POST"
            target="suggestionSubmitFrame"
            autocomplete="off"
        >

            <div class="form-group">

                <label>
                    Jenis
                </label>

                <div class="radio-group">

                    <label class="radio-option">

                        <input
                            type="radio"
                            name="${escapeAttribute(fields.jenis)}"
                            value="Kritik"
                            required
                        >

                        <span>
                            Kritik
                        </span>

                    </label>


                    <label class="radio-option">

                        <input
                            type="radio"
                            name="${escapeAttribute(fields.jenis)}"
                            value="Saran"
                        >

                        <span>
                            Saran
                        </span>

                    </label>


                    <label class="radio-option">

                        <input
                            type="radio"
                            name="${escapeAttribute(fields.jenis)}"
                            value="Pengaduan"
                        >

                        <span>
                            Pengaduan
                        </span>

                    </label>

                </div>

            </div>


            <div class="form-group">

                <label for="suggestionText">
                    Isi
                </label>

                <textarea
                    id="suggestionText"
                    name="${escapeAttribute(fields.isi)}"
                    class="form-control"
                    required
                ></textarea>

            </div>


            <div class="form-group">

                <label>
                    Ingin anonim?
                </label>

                <div class="radio-group">

                    <label class="radio-option">

                        <input
                            type="radio"
                            name="${escapeAttribute(fields.anonim)}"
                            value="Ya"
                            required
                        >

                        <span>
                            Ya
                        </span>

                    </label>


                    <label class="radio-option">

                        <input
                            type="radio"
                            name="${escapeAttribute(fields.anonim)}"
                            value="Tidak"
                        >

                        <span>
                            Tidak
                        </span>

                    </label>

                </div>

            </div>


            <div
                class="form-group"
                id="suggestionNameGroup"
            >

                <label for="suggestionName">
                    Nama
                </label>

                <input
                    type="text"
                    id="suggestionName"
                    name="${escapeAttribute(fields.nama)}"
                    class="form-control"
                >

            </div>


            <div class="form-actions">

                <button
                    type="submit"
                    class="button button-primary"
                    id="suggestionSubmitButton"
                >
                    KIRIM SARAN
                </button>

            </div>


            <div
                id="suggestionFormMessage"
                class="form-message hidden"
            ></div>

        </form>
        `;


    const form =
        $("#suggestionForm");


    const nameGroup =
        $("#suggestionNameGroup");


    const nameInput =
        $("#suggestionName");


    $$(
        `input[name="${fields.anonim}"]`,
        form
    ).forEach(
        radio => {

            radio.addEventListener(
                "change",
                () => {

                    const anonymous =
                        radio.value === "Ya" &&
                        radio.checked;


                    if (anonymous) {

                        nameGroup.classList.add(
                            "hidden"
                        );

                        nameInput.value = "";

                        nameInput.removeAttribute(
                            "required"
                        );

                    } else {

                        nameGroup.classList.remove(
                            "hidden"
                        );

                        nameInput.setAttribute(
                            "required",
                            "required"
                        );

                    }

                }
            );

        }
    );


    form?.addEventListener(
        "submit",
        handleSuggestionSubmit
    );

}


function handleSuggestionSubmit(event) {

    event.preventDefault();


    const form =
        event.currentTarget;


    const submit =
        $("#suggestionSubmitButton");


    const message =
        $("#suggestionFormMessage");


    if (!form.checkValidity()) {

        form.reportValidity();

        return;

    }


    submit.disabled = true;

    submit.textContent =
        "Mengirim...";


    message.className =
        "form-message success";

    message.textContent =
        "Pengiriman saran sedang diproses...";


    form.submit();


    setTimeout(
        () => {

            message.textContent =
                "Saran berhasil dikirim dari website. Google Forms memproses pengiriman tersebut.";


            form.reset();


            $("#suggestionNameGroup")
                ?.classList.remove(
                    "hidden"
                );


            submit.disabled = false;

            submit.textContent =
                "KIRIM SARAN";


            showToast(
                "Saran",
                "Pengiriman saran telah dipicu."
            );

        },
        1000
    );

}


/* =========================================================
   KONSEKUENSI
========================================================= */

function renderConsequenceKeypassModal() {

    modalTitle.textContent =
        "Konsekuensi";


    modalBody.innerHTML =
        `
        <div class="keypass-box">

            <h3>
                Masukkan Keypass
            </h3>

            <p>
                Akses ini hanya merupakan client-side gate.
                Bukan sistem keamanan absolut.
            </p>


            <div class="form-group">

                <label for="keypassInput">
                    Keypass
                </label>

                <input
                    type="password"
                    id="keypassInput"
                    class="form-control"
                    placeholder="********"
                    autocomplete="off"
                >

            </div>


            <button
                type="button"
                class="button button-primary"
                id="keypassButton"
            >
                LANJUTKAN
            </button>


            <div
                id="keypassMessage"
                class="form-message hidden"
            ></div>

        </div>
        `;


    const input =
        $("#keypassInput");


    const button =
        $("#keypassButton");


    button?.addEventListener(
        "click",
        () => {

            if (
                input.value !==
                CONFIG.CONSEQUENCE_KEYPASS
            ) {

                const message =
                    $("#keypassMessage");


                message.className =
                    "form-message error";

                message.textContent =
                    "Keypass salah.";


                input.select();

                return;

            }


            debugLog(
                "Keypass client-side diterima."
            );


            showConsequencePhotoThenForm();

        }
    );


    input?.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                button.click();

            }

        }
    );

}


/* =========================================================
   CONSEQUENCE RANDOM PHOTO
========================================================= */

function showConsequencePhotoThenForm() {

    modalBody.innerHTML =
        `
        <div class="keypass-box">

            <h3>
                Keypass benar
            </h3>

            <p>
                Memuat...
            </p>

            <img
                id="consequenceImage"
                class="consequence-image"
                loading="lazy"
                alt="Foto konsekuensi"
            >

        </div>
        `;


    const image =
        $("#consequenceImage");


    const randomIndex =
        Math.floor(
            Math.random() *
            CONFIG.CONSEQUENCE_IMAGES.length
        );


    image.src =
        CONFIG.CONSEQUENCE_IMAGES[
            randomIndex
        ];


    image.onerror =
        () => {

            image.removeAttribute(
                "src"
            );


            image.alt =
                "Placeholder foto";


            image.style.minHeight =
                "150px";


            image.style.background =
                "var(--color-fog-blue)";

        };


    setTimeout(
        () => {

            image.classList.add(
                "fade-out"
            );


            setTimeout(
                () => {

                    renderConsequenceForm();

                },
                350
            );

        },
        1200
    );

}


/* =========================================================
   CONSEQUENCE FORM
========================================================= */

function renderConsequenceForm() {

    modalTitle.textContent =
        "Catatan Konsekuensi";


    const fields =
        CONFIG.GOOGLE_FORMS.konsekuensi.fields;


    modalBody.innerHTML =
        `
        <form
            id="consequenceForm"
            action="${escapeAttribute(
                CONFIG.GOOGLE_FORMS.konsekuensi.action
            )}"
            method="POST"
            target="consequenceSubmitFrame"
            autocomplete="off"
        >

            <div class="form-group">

                <label for="consequenceAbsen">
                    Absen
                </label>

                <input
                    type="text"
                    id="consequenceAbsen"
                    name="${escapeAttribute(fields.absen)}"
                    class="form-control"
                    placeholder="Nomor absen"
                    required
                >

            </div>


            <div class="form-group">

                <label for="consequenceCode">
                    Kode
                </label>

                <input
                    type="text"
                    id="consequenceCode"
                    name="${escapeAttribute(fields.kode)}"
                    class="form-control"
                    placeholder="Kode"
                    required
                >

            </div>


            <div class="form-group">

                <label for="consequenceNote">
                    Catatan
                </label>

                <textarea
                    id="consequenceNote"
                    name="${escapeAttribute(fields.catatan)}"
                    class="form-control"
                    placeholder="Catatan konsekuensi..."
                    required
                ></textarea>

            </div>


            <div class="form-actions">

                <button
                    type="submit"
                    class="button button-primary"
                    id="consequenceSubmitButton"
                >
                    KIRIM CATATAN
                </button>

            </div>


            <div
                id="consequenceFormMessage"
                class="form-message hidden"
            ></div>

        </form>
        `;


    $("#consequenceForm")
        ?.addEventListener(
            "submit",
            handleConsequenceSubmit
        );

}


function handleConsequenceSubmit(event) {

    event.preventDefault();


    const form =
        event.currentTarget;


    const button =
        $("#consequenceSubmitButton");


    const message =
        $("#consequenceFormMessage");


    if (!form.checkValidity()) {

        form.reportValidity();

        return;

    }


    button.disabled = true;

    button.textContent =
        "Mengirim...";


    message.className =
        "form-message success";

    message.textContent =
        "Pengiriman catatan sedang diproses...";


    form.submit();


    setTimeout(
        () => {

            message.textContent =
                "Catatan berhasil dikirim dari website. Google Forms memproses pengiriman tersebut.";


            form.reset();


            button.disabled = false;

            button.textContent =
                "KIRIM CATATAN";


            showToast(
                "Konsekuensi",
                "Pengiriman catatan telah dipicu."
            );

        },
        1000
    );

}


/* =========================================================
   HELP
========================================================= */

function renderHelpModal() {

    modalTitle.textContent =
        "Help";


    modalBody.innerHTML =
        `
        <div class="accordion">

            ${[
                [
                    "Tentang Website",
                    "Gunakan menu yang tersedia sesuai kebutuhan. Jika ingin mencari informasi, buka menu yang sesuai lalu ikuti petunjuk di dalamnya. Jika ingin mengirim laporan atau saran, isi kolom yang diminta lalu kirim setelah memastikan data sudah benar."
                ],

                [
                    "Pengumuman",
                    "Buka Pengumuman untuk melihat informasi terbaru. Baca judul dan isi pengumuman agar tidak melewatkan informasi penting."
                ],

                [
                    "Jadwal",
                    "Buka Jadwal untuk melihat petugas 5K dan piket. Pilih bagian atau hari yang ingin dilihat, lalu gunakan tombol tutup jika sudah selesai."
                ],

                [
                    "Jadwal Pelajaran",
                    "Buka Jadwal Pelajaran, lalu pilih hari yang ingin dilihat untuk mengetahui mata pelajaran dan jadwalnya."
                ],

                [
                    "Peraturan",
                    "Buka Peraturan untuk membaca aturan kelas. Pilih bagian yang ingin dibaca dan pastikan memahami ketentuannya sebelum bertindak."
                ],

                [
                    "Data Anggota",
                    "Buka Data Anggota, kemudian gunakan kolom pencarian untuk memasukkan nama, nomor absen, NIS, NISN, tahap, atau kode yang ingin dicari."
                ],

                [
                    "Saran",
                    "Buka Saran, pilih jenis masukan jika tersedia, tuliskan saran atau pengaduan dengan jelas, lalu kirim formulir."
                ],

                [
                    "Konsekuensi",
                    "Buka Konsekuensi, pilih anggota yang akan diproses, masukkan data yang diminta, lalu masukkan keypass ketika diminta sebelum mengirim."
                ],

                [
                    "Laporan",
                    "Buka Laporan 5K, isi nama, bidang, tanggal, laporan, dan kendala bila ada. Periksa kembali isian sebelum mengirim laporan."
                ],

                [
                    "Scroll",
                    "Geser halaman ke atas atau ke bawah untuk menemukan bagian yang dibutuhkan. Gunakan tombol menu untuk membuka fitur tertentu dengan lebih cepat."
                ]

            ].map(
                ([title, content]) =>
                    `
                    <div class="accordion-item">

                        <button
                            type="button"
                            class="accordion-button"
                        >

                            <span>
                                ${escapeHtml(title)}
                            </span>

                            <span>
                                +
                            </span>

                        </button>

                        <div class="accordion-content">
                            ${escapeHtml(content)}
                        </div>

                    </div>
                    `
            ).join("")}

        </div>
        `;


    $$(".accordion-button", modalBody)
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const item =
                            button.closest(
                                ".accordion-item"
                            );


                        item.classList.toggle(
                            "open"
                        );


                        const icon =
                            button.querySelector(
                                "span:last-child"
                            );


                        icon.textContent =
                            item.classList.contains("open")
                            ? "−"
                            : "+";

                    }
                );

            }
        );

}


/* =========================================================
   NOTIFICATION
========================================================= */

function getNotifications() {

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEYS.notifications
            );


        if (!raw) {
            return [];
        }


        const parsed =
            JSON.parse(raw);


        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (error) {

        console.error(
            "[XII-9] Notification storage error:",
            error
        );

        return [];

    }

}


function saveNotifications(
    notifications
) {

    try {

        localStorage.setItem(
            STORAGE_KEYS.notifications,
            JSON.stringify(
                notifications
            )
        );


        updateNotificationBadge();

    } catch (error) {

        console.error(
            "[XII-9] Failed saving notifications:",
            error
        );

    }

}


function createNotification({

    id,

    title,

    message,

    type = "info"

}) {

    const notifications =
        getNotifications();


    /*
        Jangan membuat record duplikat.
    */

    const exists =
        notifications.some(
            notification =>
                notification.id === id
        );


    if (exists) {

        debugLog(
            "Notification duplicate skipped:",
            id
        );

        return;

    }


    notifications.unshift({

        id,

        timestamp:
            new Date().toISOString(),

        title,

        message,

        type,

        read: false

    });


    /*
        Histori tetap ada.

        Kita batasi jumlah agar localStorage
        tidak tumbuh tanpa batas.
    */

    const limited =
        notifications.slice(
            0,
            100
        );


    saveNotifications(
        limited
    );


    debugLog(
        "Notification created:",
        id
    );

}


function updateNotificationBadge() {

    const badge =
        $("#notificationBadge");


    if (!badge) {
        return;
    }


    const unread =
        getNotifications()
            .filter(
                notification =>
                    !notification.read
            ).length;


    if (!unread) {

        badge.classList.add(
            "hidden"
        );

        badge.textContent =
            "0";

        return;

    }


    badge.classList.remove(
        "hidden"
    );


    badge.textContent =
        unread > 99
        ? "99+"
        : String(unread);

}


/* =========================================================
   ANNOUNCEMENT NOTIFICATION
========================================================= */

function getActiveAnnouncements() {

    return state.data.announcements.filter(
        announcement => {

            const status =
                normalizeText(
                    getField(
                        announcement,
                        ["status"]
                    )
                );


            return status === "aktif";

        }
    );

}

function getAnnouncementSnapshot() {

    return (
        Array.isArray(
            state.data.announcements
        )
        ? state.data.announcements
        : []
    )
    .filter(
        announcement => {
            const status =
                normalizeText(
                    getField(
                        announcement,
                        ["status"]
                    )
                );

            return status === "aktif";
        }
    )
    .map(
        row => ({

            id:
                getField(
                    row,
                    ["id"]
                ),

            judul:
                getField(
                    row,
                    ["judul"]
                ),

            isi:
                getField(
                    row,
                    ["isi"]
                ),

            tanggal:
                getField(
                    row,
                    ["tanggal"]
                ),

            status:
                getField(
                    row,
                    ["status"]
                ),

            prioritas:
                getField(
                    row,
                    ["prioritas"]
                )

        })
    );

}


function stableStringify(value) {

    return JSON.stringify(
        value,
        Object.keys(value || {}).sort()
    );

}


function checkAnnouncementNotifications() {

    const current =
        getAnnouncementSnapshot();


    let previous = null;


    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEYS.announcementSnapshot
            );


        if (raw) {

            previous =
                JSON.parse(raw);

        }

    } catch (error) {

        console.error(
            "[XII-9] announcement snapshot error:",
            error
        );

    }


    const currentString =
        JSON.stringify(current);


    const previousString =
        JSON.stringify(previous);


    /*
        First load:

        simpan snapshot saja.

        Jangan spam notifikasi saat user pertama
        kali membuka website.
    */

    if (previous === null) {

        localStorage.setItem(
            STORAGE_KEYS.announcementSnapshot,
            currentString
        );

        debugLog(
            "Announcement snapshot initialized."
        );

        return;

    }


    if (
        currentString !==
        previousString
    ) {

        const snapshotHash =
            simpleHash(
                currentString
            );


        createNotification({

            id:
                `announcement-${snapshotHash}`,

            title:
                "Pengumuman diperbarui",

            message:
                "Ada perubahan pada papan pengumuman.",

            type:
                "announcement"

        });


        localStorage.setItem(
            STORAGE_KEYS.announcementSnapshot,
            currentString
        );

    }

}


/* =========================================================
   STAGE NOTIFICATION
========================================================= */

function getMemberStageSnapshot() {

    return state.data.members.map(
        member => ({

            nis:
                getField(
                    member,
                    ["nis"]
                ),

            nisn:
                getField(
                    member,
                    ["nisn"]
                ),

            absen:
                getField(
                    member,
                    ["absen"]
                ),

            nama:
                getField(
                    member,
                    ["nama"]
                ),

            tahap:
                getField(
                    member,
                    ["tahap"]
                ),

            kode:
                getField(
                    member,
                    ["kode"]
                )

        })
    );

}


function getPendingStageNotifications() {

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEYS.stagePending
            );

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (error) {

        console.error(
            "[XII-9] Stage pending storage error:",
            error
        );

        return [];
    }
}


function savePendingStageNotifications(items) {

    try {

        localStorage.setItem(
            STORAGE_KEYS.stagePending,
            JSON.stringify(items)
        );

    } catch (error) {

        console.error(
            "[XII-9] Failed saving pending stage notifications:",
            error
        );
    }
}


function isPositiveMultipleOfThree(value) {

    const number = Number(
        String(value ?? "").trim()
    );

    return Number.isFinite(number) &&
        number > 0 &&
        Number.isInteger(number) &&
        number % 3 === 0;
}


function checkStageNotifications() {

    const current =
        getMemberStageSnapshot();

    let previous = null;

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEYS.memberSnapshot
            );

        if (raw) {
            previous = JSON.parse(raw);
        }

    } catch (error) {

        console.error(
            "[XII-9] member snapshot error:",
            error
        );
    }

    const today =
        getTodayJakarta();

    let pending =
        getPendingStageNotifications();

    /*
        RELEASE:
        Notifikasi tahap baru sengaja tidak langsung muncul.
        Event yang terdeteksi hari ini masuk ke pending dan
        baru dibuat menjadi notifikasi pada hari berikutnya.
    */
    const remainingPending = [];

    pending.forEach(item => {

        if (!item || !item.id) {
            return;
        }

        if (String(item.releaseDate) <= String(today)) {

            createNotification({

                id:
                    `stage-${item.id}`,

                title:
                    "Tahap kelipatan 3 tercapai",

                message:
                    `Nama: ${item.nama || "-"}\nTahap: ${item.stage}\nTahap sebelumnya: ${item.previousStage || "-"}\nTanggal terdeteksi: ${formatDateIndonesia(item.detectedDate)}\nNotifikasi: ${formatDateIndonesia(item.releaseDate)}`,

                type:
                    "stage"
            });

        } else {
            remainingPending.push(item);
        }
    });

    pending = remainingPending;

    /*
        First load:
        hanya simpan snapshot. Tidak membuat notifikasi tahap,
        karena kita tidak tahu apakah tahap tersebut baru berubah.
    */
    if (previous === null) {

        localStorage.setItem(
            STORAGE_KEYS.memberSnapshot,
            JSON.stringify(current)
        );

        savePendingStageNotifications(pending);

        return;
    }

    const oldMap =
        new Map(
            previous.map(member => {

                const identity =
                    getMemberIdentity(member);

                return [identity, member];
            })
        );

    current.forEach(member => {

        const identity =
            getMemberIdentity(member);

        if (!identity) {
            return;
        }

        const old =
            oldMap.get(identity);

        if (!old) {
            return;
        }

        const oldStageRaw =
            getField(old, ["tahap"]);

        const newStageRaw =
            getField(member, ["tahap"]);

        const oldStage =
            Number(String(oldStageRaw || "").trim());

        const newStage =
            Number(String(newStageRaw || "").trim());

        if (!Number.isFinite(newStage)) {
            return;
        }

        /*
            Hanya tahap yang BENAR-BENAR naik dan mencapai
            kelipatan 3: 3, 6, 9, 12, dst.
        */
        if (
            !Number.isFinite(oldStage) ||
            newStage <= oldStage ||
            !isPositiveMultipleOfThree(newStage)
        ) {
            return;
        }

        const eventId =
            [
                identity,
                newStage,
                today
            ].join("|");

        const alreadyPending =
            pending.some(
                item => item.id === eventId
            );

        const notificationId =
            `stage-${eventId}`;

        const alreadyNotified =
            getNotifications().some(
                item => item.id === notificationId
            );

        if (
            alreadyPending ||
            alreadyNotified
        ) {
            return;
        }

        pending.push({

            id:
                eventId,

            identity,

            nama:
                getField(member, ["nama"]) || identity,

            stage:
                newStage,

            previousStage:
                oldStageRaw || "-",

            detectedDate:
                today,

            releaseDate:
                getTomorrowJakarta()
        });

    });

    localStorage.setItem(
        STORAGE_KEYS.memberSnapshot,
        JSON.stringify(current)
    );

    savePendingStageNotifications(pending);
}


/* =========================================================
   YESTERDAY REPORT NOTIFICATION
========================================================= */

function checkYesterdayReportNotifications() {

    const yesterday =
        getYesterdayJakarta();


    const schedule =
        findSchedule5KRowByDate(
            yesterday
        );


    if (!schedule) {

        debugLog(
            "Tidak ada jadwal 5K kemarin:",
            yesterday
        );

        return;

    }


    const missing = [];


    FIVE_K_FIELDS.forEach(
        field => {

            const petugas =
                getFiveKFieldValue(
                    schedule,
                    field
                );


            if (!petugas) {
                return;
            }


            const exists =
                getReportStatus({

                    tanggal:
                        yesterday,

                    bidang:
                        field,

                    petugas

                });


            if (!exists) {

                missing.push({

                    tanggal:
                        yesterday,

                    bidang:
                        field,

                    petugas

                });

            }

        }
    );


    if (!missing.length) {

        debugLog(
            "Semua laporan 5K kemarin sudah ada."
        );

        return;

    }


    missing.forEach(
        item => {

            const id =
                [
                    "report-missing",

                    item.tanggal,

                    normalizeText(
                        item.bidang
                    ),

                    normalizePerson(
                        item.petugas
                    )

                ].join("|");


            createNotification({

                id,

                title:
                    "Laporan 5K belum diisi",

                message:
                    `Nama: ${item.petugas}\nBidang: ${item.bidang}\nTanggal: ${formatDateIndonesia(item.tanggal)}`,

                type:
                    "report"

            });

        }
    );


    /*
        Simpan record check agar bisa didiagnosis
        melalui localStorage.

        Tidak digunakan untuk menghapus histori.
    */

    try {

        localStorage.setItem(

            STORAGE_KEYS.reportCheck,

            JSON.stringify({

                checkedAt:
                    new Date().toISOString(),

                date:
                    yesterday,

                missing

            })

        );

    } catch (error) {

        console.error(
            "[XII-9] report check storage error:",
            error
        );

    }

}


/* =========================================================
   NOTIFICATION MODAL
========================================================= */

function renderNotificationsModal() {

    if (!modalTitle || !modalBody) {
        console.error("[XII-9] Elemen modal notifikasi tidak ditemukan.");
        return;
    }

    modalTitle.textContent = "Notifikasi";

    const notifications = getNotifications()
        .filter(notification => notification && notification.id)
        .sort(
            (a, b) =>
                new Date(b.timestamp || 0) -
                new Date(a.timestamp || 0)
        );

    if (!notifications.length) {

        modalBody.innerHTML =
            `
            <div class="empty-state">
                <strong>Belum ada notifikasi.</strong>
                <p style="margin:8px 0 0;">
                    Notifikasi akan muncul otomatis jika ada anggota mencapai tahap kelipatan 3 atau ada petugas yang belum mengirim laporan 5K pada hari sebelumnya.
                </p>
            </div>
            `;

        updateNotificationBadge();
        return;
    }

    modalBody.innerHTML =
        `
        <div class="notification-list">
            ${notifications.map(
                notification => `
                <article
                    class="announcement-card notification-card"
                    data-notification-id="${escapeAttribute(notification.id)}"
                    tabindex="0"
                    role="button"
                    aria-label="Buka notifikasi ${escapeAttribute(notification.title)}"
                    style="${
                        notification.read
                            ? "opacity:.68;cursor:pointer;"
                            : "cursor:pointer;"
                    }"
                >

                    <div class="announcement-top">

                        <span class="announcement-date">
                            ${escapeHtml(
                                formatDateTime(
                                    new Date(notification.timestamp)
                                )
                            )}
                        </span>

                        <span class="badge">
                            ${
                                notification.read
                                    ? "Sudah dibaca"
                                    : "Belum dibaca"
                            }
                        </span>

                    </div>

                    <h3>
                        ${escapeHtml(notification.title)}
                    </h3>

                    <p class="announcement-content">
                        ${escapeHtml(notification.message || "Tidak ada keterangan.").replace(/\n/g, "<br>")}
                    </p>

                    ${
                        notification.read
                            ? ""
                            : `
                            <button
                                type="button"
                                class="button button-primary mark-read-button"
                                data-read-id="${escapeAttribute(notification.id)}"
                                style="margin-top:14px;"
                            >
                                Tandai dibaca
                            </button>
                            `
                    }

                </article>
                `
            ).join("")}
        </div>
        `;

    $$(".notification-card", modalBody)
        .forEach(card => {

            const openNotification = () => {

                const id =
                    card.dataset.notificationId;

                if (!id) {
                    return;
                }

                markNotificationRead(id);

                const notification =
                    getNotifications().find(
                        item => item.id === id
                    );

                if (!notification) {
                    return;
                }

                renderNotificationDetail(
                    notification
                );
            };

            card.addEventListener(
                "click",
                event => {

                    if (
                        event.target.closest(
                            ".mark-read-button"
                        )
                    ) {
                        return;
                    }

                    openNotification();
                }
            );

            card.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {

                        event.preventDefault();

                        openNotification();
                    }
                }
            );
        });

    $$(".mark-read-button", modalBody)
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();
                        event.stopPropagation();

                        markNotificationRead(
                            button.dataset.readId
                        );

                        renderNotificationsModal();
                    }
                );

            }
        );

    updateNotificationBadge();
}


function renderNotificationDetail(notification) {

    if (!modalTitle || !modalBody || !notification) {
        return;
    }

    modalTitle.textContent =
        notification.title || "Notifikasi";

    modalBody.innerHTML =
        `
        <article class="announcement-card notification-detail">

            <div class="announcement-top">

                <span class="announcement-date">
                    ${escapeHtml(
                        formatDateTime(
                            new Date(
                                notification.timestamp
                            )
                        )
                    )}
                </span>

                <span class="badge">
                    ${
                        notification.read
                            ? "Sudah dibaca"
                            : "Belum dibaca"
                    }
                </span>

            </div>

            <h3>
                ${escapeHtml(
                    notification.title || "Notifikasi"
                )}
            </h3>

            <p class="announcement-content">
                ${escapeHtml(
                    notification.message || ""
                ).replace(/\n/g, "<br>")}
            </p>

            <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">

                <button
                    type="button"
                    class="button button-primary"
                    data-notification-back
                >
                    Kembali
                </button>

                ${
                    notification.read
                        ? ""
                        : `
                        <button
                            type="button"
                            class="button button-secondary"
                            data-read-detail="${escapeAttribute(notification.id)}"
                        >
                            Tandai dibaca
                        </button>
                        `
                }

            </div>

        </article>
        `;

    $("[data-notification-back]", modalBody)
        ?.addEventListener(
            "click",
            () => {
                renderNotificationsModal();
            }
        );

    $("[data-read-detail]", modalBody)
        ?.addEventListener(
            "click",
            () => {

                markNotificationRead(
                    notification.id
                );

                const updated =
                    getNotifications().find(
                        item =>
                            item.id ===
                            notification.id
                    );

                renderNotificationDetail(
                    updated || {
                        ...notification,
                        read: true
                    }
                );
            }
        );
}


function markNotificationRead(id) {

    const notifications =
        getNotifications();


    const target =
        notifications.find(
            notification =>
                notification.id === id
        );


    if (target) {

        target.read = true;

        saveNotifications(
            notifications
        );

    } else {
        updateNotificationBadge();
    }

}


/* =========================================================
   SIMPLE HASH
========================================================= */

function simpleHash(value) {

    let hash =
        0;


    const string =
        String(value);


    for (
        let i = 0;
        i < string.length;
        i++
    ) {

        hash =
            (
                (hash << 5) -
                hash +
                string.charCodeAt(i)
            ) |
            0;

    }


    return Math.abs(hash)
        .toString(36);

}


/* =========================================================
   MODAL DATA INIT
========================================================= */

function initModalData() {

    /*
        Data sudah tersedia dari loadAllData().
        Fungsi ini sengaja ringan agar modal dirender
        ketika benar-benar dibuka.
    */

}


/* =========================================================
   NOTIFICATION INIT
========================================================= */

function initNotifications() {

    updateNotificationBadge();

    const notificationButton =
        $("#notificationButton");

    if (!notificationButton) {
        console.warn(
            "[XII-9] #notificationButton tidak ditemukan."
        );
        return;
    }

    /*
        Listener khusus notifikasi.
        stopPropagation() mencegah listener [data-modal]
        menjalankan openModal kedua kalinya.
    */
    notificationButton.addEventListener(
        "click",
        event => {

            event.preventDefault();
            event.stopPropagation();

            openModal("notifications");
        }
    );

    /*
        Jika tombol bukan <button>, keyboard Enter/Space
        tetap dapat membuka notifikasi.
    */
    notificationButton.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();
                event.stopPropagation();

                openModal("notifications");
            }
        }
    );
}


/* =========================================================
   FORM INIT
========================================================= */

function initForms() {

    /*
        Form dibuat secara dinamis saat modal dibuka.
        Listener submit dipasang di masing-masing renderer.
    */

}


/* =========================================================
   MENU BUTTON
========================================================= */

function initMenuButton() {

    $("#menuButton")
        ?.addEventListener(
            "click",
            () => {

                openModal(
                    "menu"
                );

            }
        );

}


/* =========================================================
   INNER MODAL BUTTONS
========================================================= */

function initInnerModalDelegation() {

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-inner-modal]"
                );


            if (!button) {
                return;
            }


            const type =
                button.dataset.innerModal;

            // Beri feedback visual ketika pengguna memilih opsi menu.
            // Renderer lama tetap dipakai; hanya transisi UI yang ditambahkan.
            if (modalBody) {
                modalBody.classList.remove("menu-transition-in");
                modalBody.classList.add("menu-transition-out");
            }

            window.setTimeout(() => {
                renderModal(type);

                if (modalBody) {
                    modalBody.classList.remove("menu-transition-out");
                    void modalBody.offsetWidth;
                    modalBody.classList.add("menu-transition-in");

                    window.setTimeout(() => {
                        modalBody.classList.remove("menu-transition-in");
                    }, 300);
                }
            }, 90);

        }
    );

}


/* =========================================================
   REFRESH BUTTON
========================================================= */

function initRefreshButton() {

    $("#refreshButton")
        ?.addEventListener(
            "click",
            () => {

                if (state.loading) {
                    return;
                }


                loadAllData();

            }
        );

}


/* =========================================================
   SCROLL ANIMATIONS
========================================================= */

function initScrollAnimations() {

    const elements =
        $$(".reveal");


    if (!elements.length) {
        return;
    }


    /*
        IntersectionObserver digunakan sesuai requirement.

        threshold rendah agar nyaman di Android.
    */

    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(
                    entry => {

                        if (
                            entry.isIntersecting
                        ) {

                            entry.target.classList.add(
                                "active"
                            );

                        } else {

                            /*
                                Boleh dianimasikan kembali
                                ketika masuk viewport lagi.
                            */

                            entry.target.classList.remove(
                                "active"
                            );

                        }

                    }
                );

            },
            {

                threshold:
                    0.08

            }
        );


    elements.forEach(
        element =>
            observer.observe(
                element
            )
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function escapeAttribute(value) {

    return escapeHtml(
        value
    );

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;


function showToast(
    title,
    message
) {

    const toast =
        $("#toast");


    const toastTitle =
        $("#toastTitle");


    const toastMessage =
        $("#toastMessage");


    if (
        !toast ||
        !toastTitle ||
        !toastMessage
    ) {

        return;

    }


    toastTitle.textContent =
        title;


    toastMessage.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            4000
        );

}


/* =========================================================
   DEBUG DIAGNOSTIC
========================================================= */

function printDiagnostic() {

    console.group(
        "%c[XII-9] DIAGNOSTIC",
        "background:#071739;color:white;padding:5px;font-weight:bold;"
    );


    console.log(
        "CONFIG:",
        CONFIG
    );


    console.log(
        "STATE:",
        state
    );


    console.log(
        "Today Jakarta:",
        getTodayJakarta()
    );


    console.log(
        "Yesterday Jakarta:",
        getYesterdayJakarta()
    );


    console.log(
        "Today day:",
        getTodayIndonesianDay()
    );


    console.log(
        "Schedule 5K today:",
        findToday5KRow()
    );


    console.log(
        "Notifications:",
        getNotifications()
    );


    console.log(
        "LocalStorage announcement snapshot:",
        localStorage.getItem(
            STORAGE_KEYS.announcementSnapshot
        )
    );


    console.log(
        "LocalStorage member snapshot:",
        localStorage.getItem(
            STORAGE_KEYS.memberSnapshot
        )
    );


    console.log(
        "LocalStorage report check:",
        localStorage.getItem(
            STORAGE_KEYS.reportCheck
        )
    );


    console.log(
        "LocalStorage pending stage notifications:",
        localStorage.getItem(
            STORAGE_KEYS.stagePending
        )
    );


    console.groupEnd();

}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initApp() {

    debugLog(
        "========== INIT APP =========="
    );


    initModals();

    initNotifications();

    initForms();

    initMenuButton();

    initStageConfirmation();

    initInnerModalDelegation();

    initRefreshButton();

    initScrollAnimations();


    /*
        Tampilkan animasi walaupun data belum selesai.
    */

    requestAnimationFrame(
        () => {

            $$(".reveal")
                .forEach(
                    element => {

                        /*
                            Hero pertama langsung tampil.
                        */

                        if (
                            element ===
                            $(".hero")
                        ) {

                            element.classList.add(
                                "active"
                            );

                        }

                    }
                );

        }
    );


    /*
        LOAD PERTAMA
    */

    await loadAllData();


    /*
        Diagnostic setelah load pertama.
    */

    if (CONFIG.DEBUG) {

        printDiagnostic();

    }


    /*
        POLLING:

        60 detik.

        loadAllData() memiliki guard sehingga
        tidak ada duplicate request jika request
        sebelumnya belum selesai.
    */

    setInterval(
        () => {

            debugLog(
                "Polling 60 detik → refresh data."
            );


            loadAllData();

        },
        CONFIG.POLLING_INTERVAL
    );

}


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initApp
    );

} else {

    initApp();


}



// --- ENHANCED NOTIFICATION & 5K REPORT FORM IMPROVEMENTS ---

function getNotificationHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.notifications);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function addNotification(type, title, message) {
    const list = getNotificationHistory();
    const id = Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    
    // Prevent duplicate notification with same title and message
    const isDuplicate = list.some(n => n.title === title && n.message === message);
    if (isDuplicate) return;

    list.unshift({
        id,
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false
    });

    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(list));
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.querySelector("#notificationBadge, .notification-badge, .badge-notif");
    const list = getNotificationHistory();
    const unreadCount = list.filter(n => !n.read).length;
    if (badge) {
        badge.textContent = unreadCount > 0 ? unreadCount : "";
        badge.style.display = unreadCount > 0 ? "inline-block" : "none";
    }
}

function renderNotifications() {
    const container = document.querySelector("#notificationList, #notificationContainer, .notification-list");
    if (!container) return;

    const list = getNotificationHistory();

    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px; text-align: center; color: #666;">
                <p>Tidak ada notifikasi saat ini.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => `
        <div class="notification-item ${item.read ? 'read' : 'unread'}" style="padding: 10px 14px; border-bottom: 1px solid #eee; background: ${item.read ? '#fff' : '#f0f7ff'}; margin-bottom: 4px; border-radius: 6px;">
            <div class="notification-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="font-size: 14px; color: #1e293b;">${escapeHtml(item.title)}</strong>
                <span class="notification-time" style="font-size: 11px; color: #64748b;">${formatDateTime ? formatDateTime(new Date(item.timestamp)) : new Date(item.timestamp).toLocaleString('id-ID')}</span>
            </div>
            <p style="margin: 0; font-size: 13px; color: #334155;">${escapeHtml(item.message)}</p>
        </div>
    `).join("");
}

function checkAnnouncementNotifications() {
    if (!window.state || !window.state.data) return;
    const announcements = window.state.data.announcements || [];
    const lastSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.announcementSnapshot) || "[]");
    
    announcements.forEach(item => {
        const id = getField(item, ["id", "judul"]);
        if (id && !lastSnapshot.includes(id)) {
            addNotification(
                "announcement",
                "Pengumuman Baru",
                getField(item, ["judul"]) || "Ada pengumuman terbaru."
            );
        }
    });

    const currentIds = announcements.map(item => getField(item, ["id", "judul"])).filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.announcementSnapshot, JSON.stringify(currentIds));
}

function checkStageNotifications() {
    /*
       Notifikasi tahap harus muncul saat data anggota menunjukkan
       tahap 3, 6, 9, 12, dst. Tidak menunggu hari berikutnya.
       Satu anggota + satu tahap hanya diberi notifikasi sekali
       sampai tahap berikutnya tercapai.
    */
    const members = state?.data?.members || [];

    members.forEach(member => {
        const name = getField(member, ["nama", "nama anggota"]) || "Anggota";
        const identity = getMemberIdentity(member) || normalizePerson(name);
        const rawStage = getField(member, ["tahap", "stage", "jumlah", "total", "tahapan"]);
        const match = String(rawStage ?? "").match(/\d+/);
        const stage = match ? Number(match[0]) : NaN;

        if (!identity || !isPositiveMultipleOfThree(stage)) {
            return;
        }

        const processedKey = `xii9_stage_notification_${identity}_${stage}`;
        const notifications = getNotifications();
        const notificationId = `stage-${identity}-${stage}`;

        const alreadyNotified = notifications.some(item =>
            item && (
                item.id === notificationId ||
                item.stageIdentity === identity && Number(item.stage) === stage
            )
        );

        if (alreadyNotified || localStorage.getItem(processedKey) === "true") {
            return;
        }

        createNotification({
            id: notificationId,
            title: "Tahap kelipatan 3 tercapai",
            message: `${name} telah mencapai Tahap ke-${stage}. Segera proses konfirmasi tahap tersebut.`,
            type: "stage",
            stageIdentity: identity,
            stage: stage
        });

        localStorage.setItem(processedKey, "true");
    });
}

function checkYesterdayReportNotifications() {
    if (typeof getYesterdayJakarta !== 'function' || typeof findSchedule5KRowByDate !== 'function') return;
    const yesterday = getYesterdayJakarta();
    const yesterdaySchedule = findSchedule5KRowByDate(yesterday);

    if (!yesterdaySchedule || !window.FIVE_K_FIELDS) return;

    FIVE_K_FIELDS.forEach(field => {
        const officerName = getFiveKFieldValue(yesterdaySchedule, field);
        if (officerName) {
            const hasReported = getReportStatus ? getReportStatus({
                tanggal: yesterday,
                bidang: field,
                petugas: officerName
            }) : false;

            if (!hasReported) {
                const checkKey = `missing_report_${yesterday}_${field}_${officerName}`;
                if (!localStorage.getItem(checkKey)) {
                    addNotification(
                        "report_missing",
                        "Laporan 5K Belum Terkirim",
                        `Petugas ${officerName} (${field}) tidak mengirimkan laporan 5K pada tanggal ${formatDateIndonesia ? formatDateIndonesia(yesterday) : yesterday}.`
                    );
                    localStorage.setItem(checkKey, "true");
                }
            }
        }
    });
}

function render5KReportModal(selectedBidang = "") {
    const modalTitle = document.querySelector("#modalTitle");
    const modalBody = document.querySelector("#modalBody");
    
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = "Form Laporan 5K";

    const todayRow = typeof findToday5KRow === 'function' ? findToday5KRow() : null;
    const todayOfficers = [];

    if (todayRow && window.FIVE_K_FIELDS) {
        FIVE_K_FIELDS.forEach(field => {
            const name = getFiveKFieldValue(todayRow, field);
            if (name && !todayOfficers.includes(name)) {
                todayOfficers.push(name);
            }
        });
    }

    modalBody.innerHTML = `
        <form id="laporan5KForm" class="modal-form">
            <div class="form-group" style="margin-bottom: 12px;">
                <label for="reportNama" style="display: block; font-weight: 600; margin-bottom: 4px;">Nama Petugas</label>
                <input 
                    type="text" 
                    id="reportNama" 
                    name="nama" 
                    list="petugas5KList" 
                    class="form-control" 
                    placeholder="Pilih dari daftar petugas atau ketik manual..." 
                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                    required 
                />
                <datalist id="petugas5KList">
                    ${todayOfficers.map(officer => `<option value="${escapeHtml(officer)}"></option>`).join("")}
                </datalist>
                <small style="font-size: 11px; color: #666; display: block; margin-top: 4px;">Daftar opsional berasal dari petugas 5K hari ini. Anda juga dapat mengetik nama manual.</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label for="reportBidang" style="display: block; font-weight: 600; margin-bottom: 4px;">Bidang 5K</label>
                <select id="reportBidang" name="bidang" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required>
                    <option value="">-- Pilih Bidang --</option>
                    ${(window.FIVE_K_FIELDS || ['Kebersihan', 'Keindahan', 'Ketertiban', 'Keamanan', 'Kekeluargaan']).map(f => `<option value="${f}" ${f === selectedBidang ? 'selected' : ''}>${f}</option>`).join("")}
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label for="reportTanggal" style="display: block; font-weight: 600; margin-bottom: 4px;">Tanggal</label>
                <input type="date" id="reportTanggal" name="tanggal" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" value="${typeof getTodayJakarta === 'function' ? getTodayJakarta() : new Date().toISOString().split('T')[0]}" required />
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label for="reportIsi" style="display: block; font-weight: 600; margin-bottom: 4px;">Isi Laporan</label>
                <textarea id="reportIsi" name="laporan" class="form-control" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required placeholder="Jelaskan kondisi kebersihan/ketertiban..."></textarea>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label for="reportKendala" style="display: block; font-weight: 600; margin-bottom: 4px;">Kendala (Jika ada)</label>
                <textarea id="reportKendala" name="kendala" class="form-control" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Tulis kendala jika ada..."></textarea>
            </div>

            <div class="form-actions" style="margin-top: 16px; text-align: right;">
                <button type="submit" class="button button-primary" style="padding: 8px 16px; background-color: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Kirim Laporan</button>
            </div>
        </form>
    `;

    if (typeof openModal === 'function') {
        openModal();
    }
}
