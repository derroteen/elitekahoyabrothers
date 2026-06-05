import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { ShieldCheck, PiggyBank, BookOpen, FileBarChart, Landmark, ArrowRight, Megaphone, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Elite Kahoya Brothers – Savings and Loans Chama" },
      { name: "description", content: "Elite Kahoya Brothers is a savings and loans chama providing member savings tracking, loan management, passbooks, reports, and financial records." },
      { property: "og:title", content: "Elite Kahoya Brothers – Savings and Loans Chama" },
      { property: "og:description", content: "Member savings tracking, loan management, passbooks, reports, and financial records for the Elite Kahoya Brothers chama." },
      { property: "og:url", content: "https://www.elitekahoyabrothers.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.elitekahoyabrothers.com/" }],
  }),
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

function HomePage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("announcements")
          .select("id, title, body, pinned, created_at")
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3);
        if (!cancelled) setAnnouncements((data as Announcement[]) ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingAnnouncements(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-navy/95 backdrop-blur border-b border-gold/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="font-serif text-gold text-lg font-black leading-tight">
            Elite Kahoya<br className="sm:hidden" /> Brothers
          </div>
          <nav className="flex items-center gap-4 sm:gap-6">
            <a href="#about" className="hidden sm:block text-sm text-white/70 hover:text-gold transition">About</a>
            <a href="#services" className="hidden sm:block text-sm text-white/70 hover:text-gold transition">Services</a>
            <a href="#announcements" className="hidden sm:block text-sm text-white/70 hover:text-gold transition">Announcements</a>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3.5 py-2 text-sm font-semibold text-navy hover:bg-gold-2 transition"
            >
              Member Login <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-navy overflow-hidden">
        <div className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, oklch(0.74 0.115 85 / 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, oklch(0.55 0.16 245 / 0.12) 0%, transparent 50%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight">
            Elite Kahoya Brothers
          </h1>
          <div className="w-16 h-1 bg-gold mx-auto my-6" />
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            A trusted savings and loans chama dedicated to empowering members through
            financial discipline, collective growth, and accountable stewardship.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#about"
              className="inline-flex items-center justify-center rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy hover:bg-gold-2 transition"
            >
              Learn More
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-md border border-white/20 px-6 py-3 text-sm font-medium text-white hover:bg-white/5 transition"
            >
              Member Login
            </Link>
          </div>
        </div>
      </section>

      {/* About Us */}
      <section id="about" className="py-16 sm:py-20 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-navy">About Us</h2>
            <div className="w-12 h-1 bg-gold mx-auto mt-4" />
          </div>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-foreground/80 leading-relaxed text-base sm:text-lg">
              Elite Kahoya Brothers is a registered savings and loans chama (rotating savings and credit association)
              founded on the principles of mutual trust, financial transparency, and collective prosperity.
              Our members pool resources to build individual and group wealth through disciplined savings,
              accessible credit facilities, and structured financial management.
            </p>
            <p className="text-foreground/80 leading-relaxed text-base sm:text-lg mt-4">
              With a strong commitment to accountability, we leverage modern digital tools to track every
              contribution, loan disbursement, and repayment — ensuring every member has full visibility
              into their financial journey.
            </p>
            <p className="text-foreground/80 leading-relaxed text-base sm:text-lg mt-4 font-semibold text-navy">
              Location: Eldoret City
            </p>
          </div>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="py-16 sm:py-20 bg-muted/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-card rounded-xl p-8 border border-border">
              <div className="w-10 h-10 rounded-lg bg-navy flex items-center justify-center mb-5">
                <Landmark className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-navy mb-3">Our Vision</h3>
              <p className="text-foreground/80 leading-relaxed">
                To be a leading member-driven financial cooperative that transforms lives
                through accessible savings and credit solutions, fostering economic
                independence and community resilience across Kenya.
              </p>
            </div>
            <div className="bg-card rounded-xl p-8 border border-border">
              <div className="w-10 h-10 rounded-lg bg-navy flex items-center justify-center mb-5">
                <ShieldCheck className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-navy mb-3">Our Mission</h3>
              <p className="text-foreground/80 leading-relaxed">
                To provide a secure, transparent, and member-centered platform for savings
                mobilization and loan access. We are committed to ethical financial stewardship,
                timely service delivery, and the economic empowerment of every member.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-16 sm:py-20 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-navy">Our Services</h2>
            <div className="w-12 h-1 bg-gold mx-auto mt-4" />
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Comprehensive financial tools designed to support member growth and group accountability.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceCard
              icon={<PiggyBank className="w-6 h-6" />}
              title="Savings Tracking"
              description="Real-time monitoring of member contributions, deposits, and accumulated balances with automated passbook entries."
            />
            <ServiceCard
              icon={<Landmark className="w-6 h-6" />}
              title="Loan Management"
              description="Structured loan application, approval workflows, disbursement tracking, and repayment scheduling with interest calculations."
            />
            <ServiceCard
              icon={<BookOpen className="w-6 h-6" />}
              title="Member Passbooks"
              description="Digital passbooks providing every member with a transparent, chronological record of all financial transactions."
            />
            <ServiceCard
              icon={<FileBarChart className="w-6 h-6" />}
              title="Reports & Records"
              description="Comprehensive financial reports, audit logs, and analytics for informed decision-making and regulatory compliance."
            />
          </div>
        </div>
      </section>

      {/* Announcements */}
      <section id="announcements" className="py-16 sm:py-20 bg-muted/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-navy">Announcements</h2>
            <div className="w-12 h-1 bg-gold mx-auto mt-4" />
          </div>
          {loadingAnnouncements ? (
            <div className="text-center text-muted-foreground py-8">Loading announcements…</div>
          ) : announcements.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {announcements.map((a) => (
                <div key={a.id} className="bg-card rounded-xl p-6 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Megaphone className="w-4 h-4 text-gold" />
                    {a.pinned && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gold bg-gold/10 px-2 py-0.5 rounded">
                        Pinned
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-lg font-bold text-navy mb-2">{a.title}</h3>
                  <p className="text-sm text-foreground/80 line-clamp-4 whitespace-pre-wrap">{a.body}</p>
                  <div className="text-xs text-muted-foreground mt-4">{fmtDate(a.created_at)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl p-8 border border-border text-center">
              <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Stay tuned for the latest updates from the Elite Kahoya Brothers committee.
                Members can view all announcements after signing in.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Contact Notice */}
      <section className="py-16 sm:py-20 bg-navy">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <Users className="w-10 h-10 text-gold mx-auto mb-5" />
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mb-4">Get in Touch</h2>
          <p className="text-white/70 leading-relaxed text-lg">
            For membership inquiries and official communication, please contact the
            Elite Kahoya Brothers committee through official meeting channels.
          </p>
          <p className="text-white/50 text-sm mt-4">
            Public contact details will be published here once officially designated by the organization.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-serif text-gold text-sm font-bold">Elite Kahoya Brothers</div>
          <div className="text-white/40 text-xs">
            &copy; {new Date().getFullYear()} Elite Kahoya Brothers. All rights reserved.
          </div>
          <Link
            to="/login"
            className="text-xs text-white/50 hover:text-gold transition"
          >
            Member Login
          </Link>
        </div>
      </footer>
    </div>
  );
}

function ServiceCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-card rounded-xl p-6 border border-border hover:border-gold/30 transition group">
      <div className="w-10 h-10 rounded-lg bg-navy flex items-center justify-center mb-4 group-hover:bg-navy-2 transition">
        <div className="text-gold">{icon}</div>
      </div>
      <h3 className="font-serif text-lg font-bold text-navy mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
