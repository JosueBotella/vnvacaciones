import { Link } from "react-router-dom";
import verdnaturaLogo from "@/assets/verdnatura-logo.png";

interface LogoLinkProps {
  to: string;
  className?: string;
}

/**
 * Clickable Verdnatura logo that navigates to the specified dashboard.
 * Supports Ctrl+Click / Cmd+Click to open in a new tab (native <a> behavior via react-router Link).
 */
const LogoLink = ({ to, className = "h-8 w-8 md:h-10 md:w-10 object-contain" }: LogoLinkProps) => {
  return (
    <Link to={to} className="flex-shrink-0 transition-transform duration-300 hover:scale-110">
      <img
        src={verdnaturaLogo}
        alt="Verdnatura"
        className={className}
      />
    </Link>
  );
};

export { LogoLink };
