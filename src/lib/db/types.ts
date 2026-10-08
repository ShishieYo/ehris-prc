import type { Database } from "./database.types";

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type ViewRow<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
export type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];

export type EntityType = "leave_application" | "attendance_correction" | "hr_request";
