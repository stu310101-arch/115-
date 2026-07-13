import { OtherAdmissionsDirectory } from "@/components/OtherAdmissionsDirectory";
import { SubpageHeader } from "@/components/PageNavigation";

export default function OtherAdmissionsPage() {
  return (
    <main className="subpage-main other-admissions-page">
      <SubpageHeader kicker="OTHER ADMISSIONS" title="其他招生管道" />
      <div className="other-admissions-shell">
        <OtherAdmissionsDirectory />
      </div>
    </main>
  );
}
