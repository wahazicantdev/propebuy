import Tesseract from "tesseract.js";

// ── OCR CONFIDENCE THRESHOLD ───────────────────────────
// Minimum confidence score to auto-approve a verification
// Tesseract returns confidence 0-100 for each word
// Below this threshold → flag for manual admin review
// We use 60 because Philippine IDs vary in print quality
const CONFIDENCE_THRESHOLD = 60;

// ── EXTRACT TEXT FROM IMAGE ────────────────────────────
// Takes an image buffer (from multer memoryStorage)
// Returns extracted text and average confidence score
// buffer — the raw image data from req.files
export const extractTextFromImage = async (buffer) => {
  try {
    // Tesseract.recognize() is the main OCR function
    // First param — image source (buffer, file path, or URL)
    // Second param — language code
    //   "eng" = English
    //   "eng+fil" = English + Filipino (better for PH documents)
    // Third param — options (logger for progress)
    const result = await Tesseract.recognize(
      buffer,
      "eng", // English lang — covers most Philippine ID text
      {
        // Logger function — shows OCR progress in terminal
        // Useful for debugging during development
        logger: (info) => {
          if (process.env.NODE_ENV === "development") {
            console.log(
              `OCR Progress: ${info.status} - ${Math.round((info.progress || 0) * 100)}%`,
            );
          }
        },
      },
    );

    // result.data.text — the extracted text as a string
    // result.data.confidence — average confidence 0-100
    // result.data.words — array of individual word objects with confidence

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words,
    };
  } catch (error) {
    // OCR failed — could be corrupt image or unreadable format
    console.error("OCR extraction failed:", error.message);
    return {
      text: "",
      confidence: 0,
      words: [],
    };
  }
};

// ── EXTRACT KEY FIELDS FROM ID TEXT ───────────────────
// Parses the raw OCR text from a government ID
// Tries to find name, address, and barangay
// Philippine IDs have varying formats so we use
// flexible pattern matching instead of rigid parsing
export const extractIDFields = (text) => {
  // Convert to uppercase for consistent matching
  // Philippine IDs print in various cases
  const upperText = text.toUpperCase();

  // Split into lines for line-by-line analysis
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // ── EXTRACT NAME ───────────────────────────────────
  // Most Philippine IDs have "Name:" or "PANGALAN:" label
  // or the name appears near the top of the document
  let extractedName = null;

  // Look for name patterns — common in Philippine IDs
  const namePatterns = [
    /(?:NAME|PANGALAN|FULL NAME)[:\s]+([A-Z\s,.-]+)/i,
    /(?:LAST NAME|SURNAME)[:\s]+([A-Z\s]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      extractedName = match[1].trim();
      break;
    }
  }

  // ── EXTRACT ADDRESS ────────────────────────────────
  // Look for address patterns — Philippine IDs often show
  // "Address:" or "TIRAHAN:" followed by the full address
  let extractedAddress = null;

  const addressPatterns = [
    /(?:ADDRESS|TIRAHAN|PERMANENT ADDRESS)[:\s]+([A-Z0-9\s,.-]+)/i,
    /(?:HOME ADDRESS)[:\s]+([A-Z0-9\s,.-]+)/i,
  ];

  for (const pattern of addressPatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      extractedAddress = match[1].trim();
      break;
    }
  }

  // ── EXTRACT BARANGAY ───────────────────────────────
  // Most critical field for PropeBuy verification
  // Look for barangay mention in the address or document
  let extractedBarangay = null;

  // List of Muntinlupa City barangays to match against
  // If any of these appear in the text → that is the barangay
  const muntinlupaBarangays = [
    "ALABANG",
    "BAYANAN",
    "BULI",
    "CUPANG",
    "POBLACION",
    "PUTATAN",
    "SUCAT",
    "TUNASAN",
  ];

  for (const barangay of muntinlupaBarangays) {
    if (upperText.includes(barangay)) {
      extractedBarangay = barangay;
      break;
    }
  }

  // Also try generic barangay pattern if specific not found
  if (!extractedBarangay) {
    const barangayPattern =
      /(?:BRY|BRGY|BARANGAY)[.\s]+([A-Z\s]+?)(?:\s*,|\s*CITY|\s*MUNICIPALITY|\n)/i;
    const match = upperText.match(barangayPattern);
    if (match && match[1]) {
      extractedBarangay = match[1].trim();
    }
  }

  return {
    name: extractedName,
    address: extractedAddress,
    barangay: extractedBarangay,
  };
};

// ── EXTRACT KEY FIELDS FROM BARANGAY CERTIFICATE ──────
// Parses the raw OCR text from a Barangay Certificate
// of Residency — different format from IDs
export const extractCertificateFields = (text) => {
  const upperText = text.toUpperCase();

  // ── EXTRACT RESIDENT NAME ──────────────────────────
  // Barangay certificates usually say
  // "This is to certify that [NAME] is a resident of..."
  let extractedName = null;

  const certNamePatterns = [
    /(?:CERTIFY THAT|CERTIFIES THAT|KNOWN AS)[:\s]+([A-Z\s,.-]+?)(?:\s+IS|\s+HAS|\s+WAS|\n)/i,
    /(?:MR\.|MRS\.|MS\.|MASTER|MISS)[.\s]+([A-Z\s,.-]+?)(?:\s+IS|\s+HAS|\n)/i,
    /(?:NAME OF RESIDENT|PANGALAN)[:\s]+([A-Z\s,.-]+)/i,
  ];

  for (const pattern of certNamePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      extractedName = match[1].trim();
      break;
    }
  }

  // ── EXTRACT BARANGAY FROM CERTIFICATE ─────────────
  // Certificate header usually shows the barangay name
  // "BARANGAY POBLACION" or "PUNONG BARANGAY OF POBLACION"
  let extractedBarangay = null;

  const muntinlupaBarangays = [
    "ALABANG",
    "BAYANAN",
    "BULI",
    "CUPANG",
    "POBLACION",
    "PUTATAN",
    "SUCAT",
    "TUNASAN",
  ];

  for (const barangay of muntinlupaBarangays) {
    if (upperText.includes(barangay)) {
      extractedBarangay = barangay;
      break;
    }
  }

  // ── EXTRACT DATE ISSUED ────────────────────────────
  // Check if certificate was recently issued
  // Format varies — could be "January 15, 2026" or "01/15/2026"
  let extractedDate = null;

  const datePatterns = [
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
    /(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},?\s+\d{4}/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      extractedDate = match[0];
      break;
    }
  }

  return {
    name: extractedName,
    barangay: extractedBarangay,
    dateIssued: extractedDate,
  };
};

// ── CROSS-CHECK DOCUMENTS ──────────────────────────────
// Compares extracted data from ID and Certificate
// Returns verification result with confidence level
// idFields — extracted from government ID
// certFields — extracted from barangay certificate
// claimedBarangay — the barangay the user selected during registration
export const crossCheckDocuments = (idFields, certFields, claimedBarangay) => {
  const issues = []; // list of problems found
  let score = 0; // confidence score 0-100
  let maxScore = 0; // maximum possible score

  // ── CHECK 1: BARANGAY ON ID ────────────────────────
  // Does the ID mention the claimed barangay?
  maxScore += 40; // barangay check is worth 40 points
  if (idFields.barangay) {
    const idBarangay = idFields.barangay.toUpperCase();
    const claimed = claimedBarangay.toUpperCase();
    if (idBarangay.includes(claimed) || claimed.includes(idBarangay)) {
      score += 40; // full points — barangay matches
    } else {
      issues.push(
        `ID barangay (${idFields.barangay}) does not match claimed barangay (${claimedBarangay})`,
      );
    }
  } else {
    // Barangay not found on ID — partial points
    // Could be OCR quality issue — don't fully reject
    score += 15;
    issues.push("Could not extract barangay from government ID");
  }

  // ── CHECK 2: BARANGAY ON CERTIFICATE ──────────────
  // Does the certificate mention the claimed barangay?
  maxScore += 40; // also worth 40 points
  if (certFields.barangay) {
    const certBarangay = certFields.barangay.toUpperCase();
    const claimed = claimedBarangay.toUpperCase();
    if (certBarangay.includes(claimed) || claimed.includes(certBarangay)) {
      score += 40;
    } else {
      issues.push(
        `Certificate barangay (${certFields.barangay}) does not match claimed barangay (${claimedBarangay})`,
      );
    }
  } else {
    score += 15;
    issues.push("Could not extract barangay from Barangay Certificate");
  }

  // ── CHECK 3: NAME CONSISTENCY ──────────────────────
  // Do both documents have the same name?
  maxScore += 20; // name check worth 20 points
  if (idFields.name && certFields.name) {
    // Normalize names for comparison
    // Remove extra spaces, convert to uppercase
    const idName = idFields.name.replace(/\s+/g, " ").toUpperCase().trim();
    const certName = certFields.name.replace(/\s+/g, " ").toUpperCase().trim();

    // Check if names are similar enough
    // Names might have slight OCR errors so we check
    // if one contains a significant part of the other
    const idWords = idName.split(" ").filter((w) => w.length > 2);
    const certWords = certName.split(" ").filter((w) => w.length > 2);

    // Count matching words between both names
    const matchingWords = idWords.filter((word) =>
      certWords.some(
        (certWord) => certWord.includes(word) || word.includes(certWord),
      ),
    );

    // If at least half the name words match — consider it valid
    if (
      matchingWords.length >=
      Math.min(idWords.length, certWords.length) / 2
    ) {
      score += 20;
    } else {
      issues.push("Name on ID does not match name on Barangay Certificate");
    }
  } else {
    // Could not extract both names — partial credit
    score += 10;
    issues.push(
      "Could not extract names from one or both documents for comparison",
    );
  }

  // ── CALCULATE FINAL CONFIDENCE PERCENTAGE ─────────
  const confidence = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // ── DETERMINE VERIFICATION RESULT ─────────────────
  let result;
  if (confidence >= CONFIDENCE_THRESHOLD) {
    result = "AUTO_APPROVED"; // high confidence — auto approve
  } else if (confidence >= 30) {
    result = "MANUAL_REVIEW"; // medium confidence — needs human check
  } else {
    result = "AUTO_REJECTED"; // low confidence — reject
  }

  return {
    result, // AUTO_APPROVED, MANUAL_REVIEW, AUTO_REJECTED
    confidence, // 0-100
    issues, // list of problems found
    extractedData: {
      fromID: idFields,
      fromCertificate: certFields,
    },
  };
};

// ── CHECK IF CERTIFICATE IS RECENT ────────────────────
// Barangay Certificate should be issued within 6 months
// Older certificates may not reflect current residency
// dateString — date extracted from certificate
export const isCertificateRecent = (dateString) => {
  if (!dateString) return null; // cannot determine — no date found

  try {
    const issueDate = new Date(dateString);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return issueDate >= sixMonthsAgo;
  } catch {
    return null; // date parsing failed
  }
};
