import type { Row } from "@/lib/db/types";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { saveAddress, updateContact } from "@/app/(app)/profile/actions";

export function ContactForm({ priv }: { priv: Row<"employee_private"> | null }) {
  return (
    <Card>
      <CardHeader title="Contact details" description="You can keep these up to date yourself." />
      <CardBody>
        <ActionForm action={updateContact}>
          <FormGrid>
            <TextField label="Personal email" name="personal_email" type="email" defaultValue={priv?.personal_email ?? ""} />
            <TextField label="Mobile number" name="mobile_no" type="tel" defaultValue={priv?.mobile_no ?? ""} />
          </FormGrid>
          <SubmitButton>Save contact details</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

export function AddressForm({ employeeId, type, address }: { employeeId: string; type: "residential" | "permanent"; address?: Row<"employee_addresses"> }) {
  const a = address;
  return (
    <Card>
      <CardHeader title={`${type === "residential" ? "Residential" : "Permanent"} address`} />
      <CardBody>
        <ActionForm action={saveAddress}>
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="address_type" value={type} />
          <FormGrid cols={3}>
            <TextField label="House / lot no." name="house_no" defaultValue={a?.house_no ?? ""} />
            <TextField label="Street" name="street" defaultValue={a?.street ?? ""} />
            <TextField label="Subdivision / village" name="subdivision" defaultValue={a?.subdivision ?? ""} />
            <TextField label="Barangay" name="barangay" defaultValue={a?.barangay ?? ""} />
            <TextField label="City / municipality" name="city_municipality" defaultValue={a?.city_municipality ?? ""} />
            <TextField label="Province" name="province" defaultValue={a?.province ?? ""} />
            <TextField label="ZIP code" name="zip_code" defaultValue={a?.zip_code ?? ""} />
          </FormGrid>
          <SubmitButton>Save address</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
