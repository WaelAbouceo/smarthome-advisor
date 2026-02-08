const Hero = () => {
  return (
    <section className="pt-32 pb-12 px-6">
      <div className="container mx-auto text-center max-w-3xl">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground mb-6 animate-fade-in-up">
          Smart Living <span className="text-primary">Advisor</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground font-light leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          Design your connected home in seconds with AI powered by <span className="text-primary font-medium">e&</span>.
        </p>
      </div>
    </section>
  );
};

export default Hero;
