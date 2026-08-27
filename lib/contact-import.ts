import type {
  ContactIdentity,
  ContactInput,
  ContactStage,
  Profile,
} from "@/types/db";

export const CONTACT_IMPORT_HEADERS = [
  "name",
  "stage",
  "owner_name",
  "instagram",
  "whatsapp",
  "email",
  "location",
  "billing_name",
  "billing_contact",
  "billing_address",
  "met_at",
  "notes",
] as const;

export const CONTACT_IMPORT_STAGES: ContactStage[] = [
  "new",
  "contacted",
  "replied",
  "negotiating",
  "customer",
  "lost",
];

export const CONTACT_IMPORT_MAX_ROWS = 500;
export const CONTACT_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type ContactImportField = (typeof CONTACT_IMPORT_HEADERS)[number];
export type ContactImportValue = string | number | Date | null;

export type RawContactImportRow = {
  rowNumber: number;
  values: Partial<Record<ContactImportField, ContactImportValue>>;
  formulaFields?: ContactImportField[];
};

export type ContactImportIssue = {
  level: "error" | "warning";
  field?: ContactImportField;
  message: string;
};

export type ContactImportRow = {
  rowNumber: number;
  input: ContactInput;
  ownerName: string | null;
  issues: ContactImportIssue[];
  valid: boolean;
};

export type ContactImportResult = {
  rows: ContactImportRow[];
  summary: {
    total: number;
    valid: number;
    warnings: number;
    invalid: number;
  };
};

export function normalizeContactImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function text(value: ContactImportValue | undefined) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function optional(value: ContactImportValue | undefined) {
  return text(value) || null;
}

function normalizedIdentity(
  field: "instagram" | "whatsapp" | "email",
  value: string | null,
) {
  if (!value) return "";
  if (field === "whatsapp") return value.replace(/\D/g, "");
  if (field === "instagram")
    return value.trim().replace(/^@/, "").toLowerCase();
  return value.trim().toLowerCase();
}

function excelDateToYmd(serial: number) {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const milliseconds = Math.round((serial - 25_569) * 86_400_000);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function validYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeMetAt(value: ContactImportValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  let ymd: string | null = null;
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) ymd = value.toISOString().slice(0, 10);
  } else if (typeof value === "number") {
    ymd = excelDateToYmd(value);
  } else {
    const candidate = String(value).trim();
    if (validYmd(candidate)) ymd = candidate;
  }
  return ymd ? `${ymd}T00:00:00.000Z` : undefined;
}

function hasEmailShape(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function addDuplicateWarnings(
  rows: ContactImportRow[],
  existingContacts: ContactIdentity[],
) {
  const fields = ["email", "whatsapp", "instagram"] as const;
  const existing = Object.fromEntries(
    fields.map((field) => [
      field,
      new Set(
        existingContacts
          .map((contact) => normalizedIdentity(field, contact[field]))
          .filter(Boolean),
      ),
    ]),
  ) as Record<(typeof fields)[number], Set<string>>;

  for (const field of fields) {
    const workbookValues = new Map<string, ContactImportRow[]>();
    rows.forEach((row) => {
      const key = normalizedIdentity(field, row.input[field]);
      if (!key) return;
      const matches = workbookValues.get(key) ?? [];
      matches.push(row);
      workbookValues.set(key, matches);
      if (existing[field].has(key)) {
        row.issues.push({
          level: "warning",
          field,
          message: `This ${field} already appears on an existing contact.`,
        });
      }
    });
    workbookValues.forEach((matches) => {
      if (matches.length < 2) return;
      matches.forEach((row) =>
        row.issues.push({
          level: "warning",
          field,
          message: `This ${field} is repeated in the workbook.`,
        }),
      );
    });
  }
}

export function validateContactImportRows(
  rawRows: RawContactImportRow[],
  profiles: Profile[],
  existingContacts: ContactIdentity[] = [],
): ContactImportResult {
  const ownerMap = new Map<string, Profile[]>();
  profiles.forEach((profile) => {
    const key = profile.name.trim().toLowerCase();
    ownerMap.set(key, [...(ownerMap.get(key) ?? []), profile]);
  });

  const rows = rawRows.map<ContactImportRow>((raw) => {
    const issues: ContactImportIssue[] = [];
    const name = text(raw.values.name);
    const stageValue = text(raw.values.stage).toLowerCase() || "new";
    const ownerValue = text(raw.values.owner_name);
    const metAt = normalizeMetAt(raw.values.met_at);

    if (!name) {
      issues.push({ level: "error", field: "name", message: "Name is required." });
    }

    const stage = CONTACT_IMPORT_STAGES.includes(stageValue as ContactStage)
      ? (stageValue as ContactStage)
      : "new";
    if (stage !== stageValue) {
      issues.push({
        level: "error",
        field: "stage",
        message: `Stage “${stageValue}” is not recognized.`,
      });
    }

    let assignedTo: string | null = null;
    let ownerName: string | null = null;
    if (ownerValue && ownerValue.toLowerCase() !== "unassigned") {
      const owners = ownerMap.get(ownerValue.toLowerCase()) ?? [];
      if (owners.length === 1) {
        assignedTo = owners[0].id;
        ownerName = owners[0].name;
      } else if (owners.length > 1) {
        issues.push({
          level: "error",
          field: "owner_name",
          message: `Owner “${ownerValue}” is ambiguous.`,
        });
      } else {
        issues.push({
          level: "error",
          field: "owner_name",
          message: `Owner “${ownerValue}” is not a current team member.`,
        });
      }
    }

    const email = optional(raw.values.email);
    if (email && !hasEmailShape(email)) {
      issues.push({
        level: "error",
        field: "email",
        message: `Email “${email}” is not valid.`,
      });
    }
    if (raw.values.met_at !== null && raw.values.met_at !== undefined && text(raw.values.met_at) && metAt === undefined) {
      issues.push({
        level: "error",
        field: "met_at",
        message: "Met at must be an Excel date or YYYY-MM-DD.",
      });
    }
    (raw.formulaFields ?? []).forEach((field) =>
      issues.push({
        level: "error",
        field,
        message: `Formulas are not allowed in ${field}.`,
      }),
    );

    const input: ContactInput = {
      name,
      stage,
      assigned_to: assignedTo,
      instagram: optional(raw.values.instagram),
      whatsapp: optional(raw.values.whatsapp),
      email,
      location: optional(raw.values.location),
      billing_name: optional(raw.values.billing_name),
      billing_contact: optional(raw.values.billing_contact),
      billing_address: optional(raw.values.billing_address),
      met_at: metAt ?? null,
      notes: optional(raw.values.notes),
    };

    return {
      rowNumber: raw.rowNumber,
      input,
      ownerName,
      issues,
      valid: !issues.some((issue) => issue.level === "error"),
    };
  });

  addDuplicateWarnings(rows, existingContacts);
  rows.forEach((row) => {
    row.valid = !row.issues.some((issue) => issue.level === "error");
  });

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      warnings: rows.filter((row) => row.issues.some((issue) => issue.level === "warning")).length,
      invalid: rows.filter((row) => !row.valid).length,
    },
  };
}
