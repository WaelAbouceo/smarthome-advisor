import { Button } from "@/components/ui/button";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* e& Logo */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-primary">e</span>
                <span className="text-primary">&</span>
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Products
            </a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Solutions
            </a>
            <a href="#" className="text-sm font-medium text-foreground transition-colors">
              Smart Living
            </a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Support
            </a>
          </nav>

          {/* CTA */}
          <Button 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 font-medium shadow-button transition-all duration-300 hover:shadow-lg"
          >
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
