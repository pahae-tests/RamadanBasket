import FamilyForm from "../../components/familyForm";
import { PageHeader } from "../../components/ui";

export default function NewFamily() {
  return (
    <>
      <PageHeader
        title="Nouvelle famille"
        description="Enregistrez une famille en quelques secondes. Le CIN est vérifié pendant la saisie."
        breadcrumbs={[{ label: "Familles", href: "/families" }, { label: "Nouvelle famille" }]}
      />
      <FamilyForm />
    </>
  );
}
