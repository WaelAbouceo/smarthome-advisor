import { LucideIcon } from "lucide-react";

interface RoomCardProps {
  room: string;
  product: string;
  benefit: string;
  price: number;
  icon: LucideIcon;
  delay?: number;
}

const RoomCard = ({ room, product, benefit, price, icon: Icon, delay = 0 }: RoomCardProps) => {
  return (
    <div 
      className="bg-secondary/50 rounded-xl p-4 hover:bg-secondary transition-all duration-300 hover:shadow-sm animate-fade-in-up group"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">{room}</h4>
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              AED {price}/mo
            </span>
          </div>
          <p className="text-sm font-medium text-foreground/80 mt-1">{product}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{benefit}</p>
        </div>
      </div>
    </div>
  );
};

export default RoomCard;
