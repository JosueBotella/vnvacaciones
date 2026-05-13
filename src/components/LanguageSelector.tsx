import { useLanguage, Language, languageFlags } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";

export const LanguageSelector = () => {
  const { language, setLanguage } = useLanguage();

  const languages: Language[] = ["es", "ar", "fr"];

  return (
    <div className="flex gap-0.5 bg-secondary/80 backdrop-blur-sm rounded-full p-0.5">
      {languages.map((lang) => (
        <Button
          key={lang}
          variant={language === lang ? "default" : "ghost"}
          size="sm"
          onClick={() => setLanguage(lang)}
          className={`
            rounded-full w-9 h-9 p-0 text-base transition-all
            ${language === lang 
              ? "bg-primary text-primary-foreground shadow-md" 
              : "hover:bg-secondary-foreground/10"
            }
          `}
        >
          {languageFlags[lang]}
        </Button>
      ))}
    </div>
  );
};
