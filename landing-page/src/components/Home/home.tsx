import LandingNavbar from "./LandingNavbar";
import HeroSection from "./HeroSection";
import AudienceSection from "./AudienceSection";
import AIFeaturesSection from "./AIFeaturesSection";
import LiveDemoSection from "./LiveDemoSection";
import CoursesSection from "./CoursesSection";
import ToolsSection from "./ToolsSection";
import TestimonialsSection from "./TestimonialsSection";
import FinalCTASection from "./FinalCTASection";
import Footer from "./Footer";

export default function Home() {
  return (
    <div className="lp">
      <LandingNavbar />
      <main>
        <HeroSection />
        <AudienceSection />
        <AIFeaturesSection />
        <LiveDemoSection />
        <CoursesSection />
        <ToolsSection />
        <TestimonialsSection />
        <FinalCTASection />
      </main>
      <Footer />
    </div>
  );
}
