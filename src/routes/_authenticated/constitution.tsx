import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import { useAuth } from "@/lib/auth-context";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/constitution")({
  component: ConstitutionPage,
  head: () => ({ meta: [{ title: "Constitution — EKB" }] }),
});

function ConstitutionPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = !!role;

  useEffect(() => { if (!loading && !role) navigate({ to: "/login" }); }, [loading, role, navigate]);
  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = 40;

    const addText = (text: string, options: { bold?: boolean; size?: number; indent?: number } = {}) => {
      const { bold = false, size = 11, indent = 0 } = options;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 40;
        }
        doc.text(line, margin + indent, y);
        y += size * 1.4;
      }
    };

    const addSection = (title: string, body: string[]) => {
      addText(title, { bold: true, size: 14 });
      y += 4;
      body.forEach((line) => {
        if (line.startsWith("- ")) {
          addText(line.replace("- ", "• "), { size: 11, indent: 18 });
        } else {
          addText(line, { size: 11 });
        }
      });
      y += 8;
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ELITE KAHOYA BROTHERS SELF HELP GROUP", margin, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("Official Constitutional Document", margin, y);
    y += 26;

    const sections: Array<{ title: string; body: string[] }> = [
      {
        title: "1.0 NAME",
        body: [
          "The name of the group is ELITE KAHOYA BROTHERS SELF HELP GROUP (E.K.B.S.F.G).",
        ],
      },
      {
        title: "2.0 OBJECTIVES",
        body: [
          "2.1 Group Main Objectives",
          "- To assist members to access business loans and other financial and advisory services from E.K.B.S.F.G.",
          "- Assisting one another with knowledge and skills of promoting members business.",
          "- Enhancing unity among the business community in our area of operation.",
          "",
          "2.2 Specific Objectives",
          "- To secure business loans and other financial services from E.K.B.S.F.G for the promotion of individual members business.",
          "- To advance members through the promotion of talents by organizing seminars, training courses, and business advisory services for members.",
          "- To carry out activities to promote members domestic welfare.",
        ],
      },
      {
        title: "3.0 MEMBERSHIP AND GOVERNANCE",
        body: [
          "The membership of the group shall be a minimum of 15 and a maximum of 20 members. A member shall be aged 18 years and above.",
          "",
          "General Requirements:",
          "- Must be well known to the group members.",
          "- Shall not belong to more than one group.",
          "- Willing to attend periodic meetings.",
          "- Must be engaged in an income-generating activity that is viable, legal, and socially acceptable.",
        ],
      },
      {
        title: "4.0 GOVERNANCE STRUCTURE & EXECUTIVE COMMITTEE",
        body: [
          "4.1 The Secretariat Structure",
          "- Shall be the highest authority of the group.",
          "- Shall ensure overall control and oversee the operation of the executive committee.",
          "- Shall serve as the credit committee of the group.",
          "- The group secretariat shall be the custodian of the property, assets, and management policy of the group.",
          "- Shall serve as the disciplinary arm.",
          "",
          "4.2 Executive Committee Members",
          "The Executive Committee shall consist of the Chairperson, Secretary, and Treasurer. Office bearers shall be elected in an Annual General Meeting (AGM) after every one (1) year.",
          "",
          "4.3 Duties of the Chairman",
          "- Shall chair all the meetings of the group.",
          "- Shall provide general policy guidelines related to the affairs of the group.",
          "- Ensure that all members work together in harmony.",
          "- Reconcile members differences to ensure a cohesive group.",
          "- Motivate the members and set a good example to them.",
          "- Advise and encourage members who have difficulties.",
          "- Ensure that all loan amounts are paid as per the agreement.",
          "- Shall be the contact person between the group and E.K.B.S.F.G.",
          "- Shall be a signatory to the group account.",
          "",
          "4.4 Duties of the Secretary",
          "- Keep a fully complete and up-to-date record of the group affairs.",
          "- Carry out correspondence on behalf of the group.",
          "- Ensure effective and efficient flow of information.",
          "- Shall be a signatory to the group account.",
          "- To deputize when the Chairman or other executive members are absent.",
          "",
          "4.5 Duties of the Treasurer",
          "- Keep all the financial records.",
          "- Open a savings account on advice of the Executive Committee.",
          "- Ensure that all loan and savings received are banked promptly every week.",
          "- Provide reports on the financial statements of the group.",
          "- Shall be a signatory to the group accounts.",
          "- Will be in charge of monies and requests payments the group receives or makes.",
          "- Provide financial information and advice to group members.",
          "- Ensure reconciliation of member contributions and loan records.",
          "- Record all savings contributions and funds.",
          "- Maintain all financial records and make weekly reports.",
          "",
          "4.6 Group Chief Whip",
          "- Ensure smooth running of the group by making sure the constitution is upheld.",
          "- Ensure the right action is taken against members who break the constitution.",
        ],
      },
      {
        title: "5.0 MEETINGS & VOTING PROCEDURES",
        body: [
          "The group shall hold an Annual General Meeting every one (1) year.",
          "",
          "5.1 Notice of Annual General Meetings",
          "Members will be served with a twenty-one (21) days notice. The notice should specify the place, day, and the hour of the meeting.",
          "",
          "5.2 Proceedings at General Meetings",
          "The Chairperson shall chair every annual general meeting and shall appoint a returning officer to supervise elections and the sharing of dividends.",
          "",
          "5.3 Voting at General Meetings",
          "- Every member shall have one vote.",
          "- A resolution put to vote shall be decided on a show of hands unless a poll is demanded by at least two members.",
          "- In case of equality of votes, the chairperson shall be entitled to a casting vote.",
          "- During the AGM, secretariat and Executive Committee members will be elected through secret ballot.",
          "",
          "5.4 Weekly Meetings",
          "- All members shall attend weekly meetings.",
          "- The chairperson will chair all weekly meetings.",
          "- The secretary will call the register of members.",
          "- The treasurer will collect savings and loans for banking.",
          "- The treasurer will make entries in the individual passbook and sign.",
        ],
      },
      {
        title: "6.0 FINANCIAL OPERATIONS & FUND MANAGEMENT",
        body: [
          "",
          "6.1 Operation of E.K.B.S.F.G Fund",
          "The group shall open a savings account at a recognized financial institution operated by the Chairperson, Treasurer, and Secretary.",
          "- Members will save a minimum of Kshs. 300 per week.",
          "- A member who fails to repay will be fined by the group.",
          "- A member who fails to remit weekly repayment is liable to a fine of 20% or as the group may decide.",
        ],
      },
      {
        title: "7.0 LOAN RECOVERY FRAMEWORK & DEFAULT PROCEDURES",
        body: [
          "STEP 1: INITIAL ABSENCE & GUARANTOR INTERVENTION",
          "If a member does not attend meetings, officials must guide guarantors to contribute for such a member and follow up. A fine for non-attendance and non-repayment is levied if no valid reason is given.",
          "",
          "STEP 2: FORMAL NOTICE (14 DAYS)",
          "If the member does not clear arrears, officials will write a letter giving the member 14 days to pay all arrears, fines, and other fees.",
          "",
          "STEP 3: HOME VISIT & ASSET ASSESSMENT",
          "Group officials should visit the member and assess why the client is not paying. A case study must be prepared and shared during group meetings.",
          "",
          "STEP 4: RECALL OF TOTAL LOAN BALANCE",
          "If the member has not paid by the 3rd meeting, a letter recalling the whole amount is written to the member.",
          "",
          "STEP 5: REPOSSESSION & ASSET DISPOSAL",
          "If the client has not responded, the executive committee should repossess from the member. Items repossessed must be placed in the custody of guarantors for not more than 14 days, after which they will be disposed of by private sale or public auction.",
        ],
      },
      {
        title: "8.0 RESPONSIBILITIES OF THE CREDIT COMMITTEE",
        body: [
          "- Will visit members businesses before loan interviews.",
          "- Will assess the value of securities offered by the member.",
          "- The committee shall record the securities serial numbers and other relevant details.",
          "- Ensure that a personal guarantor is provided.",
          "- Ensure that the member does not sell pledged securities during loan repayment.",
        ],
      },
      {
        title: "9.0 MEMBER RESPONSIBILITIES & DISCIPLINE",
        body: [
          "9.1 Core Obligations",
          "- Every member must save and repay the loan promptly.",
          "- Each member will offer personal guarantees for loans given to the whole group.",
          "- Every member must inform the executive of any member who intends to default.",
          "",
          "9.2 Fines and Disciplinary Penalties",
          "- Absenteeism more than two times: Fine of Kshs. 200",
          "- Breach of Secrecy: Fine of Kshs. 200 plus apology letter and warning letter",
          "- Noise making during meetings: Fine of Kshs. 50",
          "- Phone ringing during meetings: Fine of Kshs. 50",
          "- Drunkenness or disorderly conduct: Fine of Kshs. 1,000",
          "- Lateness: Kshs. 20 per sitting",
        ],
      },
      {
        title: "10.0 DISQUALIFICATION & EXIT PROTOCOLS",
        body: [
          "10.1 Disqualification of Executive Committee Members",
          "An executive committee member shall vacate office if they:",
          "- Die",
          "- Resign from office by a one-month notice in writing",
          "- Are removed by a resolution passed by two-thirds majority",
          "- Fail to attend four consecutive meetings without special leave",
          "- Accept a bribe",
          "- Mismanage funds",
          "- Fail to repay loans for three consecutive occasions",
          "",
          "10.2 Members Dues on Exit (Voluntary Exit)",
          "- A member wishing to leave must give a one-month notice.",
          "- Money will be refunded after the notice period expires.",
          "- If the group has problems recovering loans, the exiting member will wait until defaulting cases are recovered.",
          "- Other contributions for group use will not be refunded.",
          "- A member cannot exit if they have an active loan or owe money to the group.",
        ],
      },
    ];

    sections.forEach((section, index) => {
      if (index !== 0) {
        y += 8;
        if (y > doc.internal.pageSize.getHeight() - 80) {
          doc.addPage();
          y = 40;
        }
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 18;
      }
      addSection(section.title, section.body);
    });

    doc.save("EKB-Constitution.pdf");
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Constitution"
        subtitle="Official Elite Kahoya Brothers constitutional document"
        actions={
          <Button className="bg-navy text-white hover:bg-navy-2" onClick={downloadPDF}>
            <FileText className="w-4 h-4 mr-2" /> Download PDF
          </Button>
        }
      />

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <h2 className="text-navy text-xl font-bold">ELITE KAHOYA BROTHERS SELF HELP GROUP</h2>
          <p className="text-sm text-muted-foreground">Official Constitutional Document</p>
        </div>

        <section className="space-y-4">
          <div>
            <h3 className="text-navy text-lg font-bold">1.0 NAME</h3>
            <p className="mt-2">The name of the group is ELITE KAHOYA BROTHERS SELF HELP GROUP (E.K.B.S.F.G).</p>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">2.0 OBJECTIVES</h3>
            <div className="space-y-2">
              <div>
                <h4 className="text-navy text-base font-semibold">2.1 Group Main Objectives</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>To assist members to access business loans and other financial and advisory services from E.K.B.S.F.G.</li>
                  <li>Assisting one another with knowledge and skills of promoting members business.</li>
                  <li>Enhancing unity among the business community in our area of operation.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">2.2 Specific Objectives</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>To secure business loans and other financial services from E.K.B.S.F.G for the promotion of individual members business.</li>
                  <li>To advance members through the promotion of talents by organizing seminars, training courses, and business advisory services for members.</li>
                  <li>To carry out activities to promote members domestic welfare.</li>
                </ul>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">3.0 MEMBERSHIP AND GOVERNANCE</h3>
            <p>The membership of the group shall be a minimum of 15 and a maximum of 20 members. A member shall be aged 18 years and above.</p>
            <p className="font-semibold">General Requirements:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
              <li>Must be well known to the group members.</li>
              <li>Shall not belong to more than one group.</li>
              <li>Willing to attend periodic meetings.</li>
              <li>Must be engaged in an income-generating activity that is viable, legal, and socially acceptable.</li>
            </ul>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">4.0 GOVERNANCE STRUCTURE & EXECUTIVE COMMITTEE</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-navy text-base font-semibold">4.1 The Secretariat Structure</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Shall be the highest authority of the group.</li>
                  <li>Shall ensure overall control and oversee the operation of the executive committee.</li>
                  <li>Shall serve as the credit committee of the group.</li>
                  <li>The group secretariat shall be the custodian of the property, assets, and management policy of the group.</li>
                  <li>Shall serve as the disciplinary arm.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">4.2 Executive Committee Members</h4>
                <p>The Executive Committee shall consist of the Chairperson, Secretary, and Treasurer. Office bearers shall be elected in an Annual General Meeting (AGM) after every one (1) year.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">4.3 Duties of the Chairman</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Shall chair all the meetings of the group.</li>
                  <li>Shall provide general policy guidelines related to the affairs of the group.</li>
                  <li>Ensure that all members work together in harmony.</li>
                  <li>Reconcile members differences to ensure a cohesive group.</li>
                  <li>Motivate the members and set a good example to them.</li>
                  <li>Advise and encourage members who have difficulties.</li>
                  <li>Ensure that all loan amounts are paid as per the agreement.</li>
                  <li>Shall be the contact person between the group and E.K.B.S.F.G.</li>
                  <li>Shall be a signatory to the group account.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">4.4 Duties of the Secretary</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Keep a fully complete and up-to-date record of the group affairs.</li>
                  <li>Carry out correspondence on behalf of the group.</li>
                  <li>Ensure effective and efficient flow of information.</li>
                  <li>Shall be a signatory to the group account.</li>
                  <li>To deputize when the Chairman or other executive members are absent.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">4.5 Duties of the Treasurer</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Keep all the financial records.</li>
                  <li>Open a savings account on advice of the Executive Committee.</li>
                  <li>Ensure that all loan and savings received are banked promptly every week.</li>
                  <li>Provide reports on the financial statements of the group.</li>
                  <li>Shall be a signatory to the group accounts.</li>
                  <li>Will be in charge of monies and requests payments the group receives or makes.</li>
                  <li>Provide financial information and advice to group members.</li>
                  <li>Ensure reconciliation of member contributions and loan records.</li>
                  <li>Record all savings contributions and funds.</li>
                  <li>Maintain all financial records and make weekly reports.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">4.6 Group Chief Whip</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Ensure smooth running of the group by making sure the constitution is upheld.</li>
                  <li>Ensure the right action is taken against members who break the constitution.</li>
                </ul>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">5.0 MEETINGS & VOTING PROCEDURES</h3>
            <p>The group shall hold an Annual General Meeting every one (1) year.</p>
            <div className="space-y-4">
              <div>
                <h4 className="text-navy text-base font-semibold">5.1 Notice of Annual General Meetings</h4>
                <p>Members will be served with a twenty-one (21) days notice. The notice should specify the place, day, and the hour of the meeting.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">5.2 Proceedings at General Meetings</h4>
                <p>The Chairperson shall chair every annual general meeting and shall appoint a returning officer to supervise elections and the sharing of dividends.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">5.3 Voting at General Meetings</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Every member shall have one vote.</li>
                  <li>A resolution put to vote shall be decided on a show of hands unless a poll is demanded by at least two members.</li>
                  <li>In case of equality of votes, the chairperson shall be entitled to a casting vote.</li>
                  <li>During the AGM, secretariat and Executive Committee members will be elected through secret ballot.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">5.4 Weekly Meetings</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>All members shall attend weekly meetings.</li>
                  <li>The chairperson will chair all weekly meetings.</li>
                  <li>The secretary will call the register of members.</li>
                  <li>The treasurer will collect savings and loans for banking.</li>
                  <li>The treasurer will make entries in the individual passbook and sign.</li>
                </ul>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">6.0 FINANCIAL OPERATIONS & FUND MANAGEMENT</h3>
            <div className="space-y-2">
              <h4 className="text-navy text-base font-semibold">6.1 Operation of E.K.B.S.F.G Fund</h4>
              <p>The group shall open a savings account at a recognized financial institution operated by the Chairperson, Treasurer, and Secretary.</p>
              <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                <li>Members will save a minimum of Kshs. 300 per week.</li>
                <li>A member who fails to repay will be fined by the group.</li>
                <li>A member who fails to remit weekly repayment is liable to a fine of 20% or as the group may decide.</li>
              </ul>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">7.0 LOAN RECOVERY FRAMEWORK & DEFAULT PROCEDURES</h3>
            <div className="space-y-3">
              <div>
                <h4 className="text-navy text-base font-semibold">STEP 1: INITIAL ABSENCE & GUARANTOR INTERVENTION</h4>
                <p>If a member does not attend meetings, officials must guide guarantors to contribute for such a member and follow up. A fine for non-attendance and non-repayment is levied if no valid reason is given.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">STEP 2: FORMAL NOTICE (14 DAYS)</h4>
                <p>If the member does not clear arrears, officials will write a letter giving the member 14 days to pay all arrears, fines, and other fees.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">STEP 3: HOME VISIT & ASSET ASSESSMENT</h4>
                <p>Group officials should visit the member and assess why the client is not paying. A case study must be prepared and shared during group meetings.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">STEP 4: RECALL OF TOTAL LOAN BALANCE</h4>
                <p>If the member has not paid by the 3rd meeting, a letter recalling the whole amount is written to the member.</p>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">STEP 5: REPOSSESSION & ASSET DISPOSAL</h4>
                <p>If the client has not responded, the executive committee should repossess from the member. Items repossessed must be placed in the custody of guarantors for not more than 14 days, after which they will be disposed of by private sale or public auction.</p>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">8.0 RESPONSIBILITIES OF THE CREDIT COMMITTEE</h3>
            <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
              <li>Will visit members businesses before loan interviews.</li>
              <li>Will assess the value of securities offered by the member.</li>
              <li>The committee shall record the securities serial numbers and other relevant details.</li>
              <li>Ensure that a personal guarantor is provided.</li>
              <li>Ensure that the member does not sell pledged securities during loan repayment.</li>
            </ul>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">9.0 MEMBER RESPONSIBILITIES & DISCIPLINE</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-navy text-base font-semibold">9.1 Core Obligations</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Every member must save and repay the loan promptly.</li>
                  <li>Each member will offer personal guarantees for loans given to the whole group.</li>
                  <li>Every member must inform the executive of any member who intends to default.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">9.2 Fines and Disciplinary Penalties</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Absenteeism more than two times: Fine of Kshs. 200</li>
                  <li>Breach of Secrecy: Fine of Kshs. 200 plus apology letter and warning letter</li>
                  <li>Noise making during meetings: Fine of Kshs. 50</li>
                  <li>Phone ringing during meetings: Fine of Kshs. 50</li>
                  <li>Drunkenness or disorderly conduct: Fine of Kshs. 1,000</li>
                  <li>Lateness: Kshs. 20 per sitting</li>
                </ul>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200" />

          <div className="space-y-3">
            <h3 className="text-navy text-lg font-bold">10.0 DISQUALIFICATION & EXIT PROTOCOLS</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-navy text-base font-semibold">10.1 Disqualification of Executive Committee Members</h4>
                <p>An executive committee member shall vacate office if they:</p>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>Die</li>
                  <li>Resign from office by a one-month notice in writing</li>
                  <li>Are removed by a resolution passed by two-thirds majority</li>
                  <li>Fail to attend four consecutive meetings without special leave</li>
                  <li>Accept a bribe</li>
                  <li>Mismanage funds</li>
                  <li>Fail to repay loans for three consecutive occasions</li>
                </ul>
              </div>
              <div>
                <h4 className="text-navy text-base font-semibold">10.2 Members Dues on Exit (Voluntary Exit)</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside ml-4 text-sm">
                  <li>A member wishing to leave must give a one-month notice.</li>
                  <li>Money will be refunded after the notice period expires.</li>
                  <li>If the group has problems recovering loans, the exiting member will wait until defaulting cases are recovered.</li>
                  <li>Other contributions for group use will not be refunded.</li>
                  <li>A member cannot exit if they have an active loan or owe money to the group.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </Card>
    </div>
  );
}
