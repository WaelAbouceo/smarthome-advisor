import { useEffect, useState } from "react";
import {
  Shield,
  Tv,
  Wifi,
  DoorOpen,
  Sofa,
  CookingPot,
  BedDouble,
  Baby,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import RoomCard from "./RoomCard";
import type { AdvisorChatResponse, ProductCatalog, RecommendationItem } from "@/lib/api";
import { getProductCatalog } from "@/lib/api";

const ROOM_ICONS: Record<string, LucideIcon> = {
  "Living": Sofa,
  "Entrance": DoorOpen,
  "Main Entrance": DoorOpen,
  "Entry": DoorOpen,
  "Bedroom": BedDouble,
  "Master Bedroom": BedDouble,
  "Kitchen": CookingPot,
  "Kids Room": Baby,
  "Whole Home": Wifi,
  "Perimeter": Shield,
  "Reception": DoorOpen,
  "Open Space": Tv,
  "Meeting Room": Tv,
};
const DEFAULT_ICON = Wifi;

function getIconForRoom(room: string): LucideIcon {
  return ROOM_ICONS[room] ?? DEFAULT_ICON;
}

interface SmartHomePlanProps {
  isVisible: boolean;
  plan: AdvisorChatResponse | null;
}

const SmartHomePlan = ({ isVisible, plan }: SmartHomePlanProps) => {
  const [catalog, setCatalog] = useState<ProductCatalog | null>(null);

  useEffect(() => {
    getProductCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  const productMap =
    catalog?.products?.reduce(
      (acc, p) => {
        acc[p.product_id] = { name: p.name, price: p.price_monthly ?? 0 };
        return acc;
      },
      {} as Record<string, { name: string; price: number }>,
    ) ?? {};
  const bundleList = catalog?.bundles ?? [];
  
  // Recalculate best matching bundle based on current recommendations
  // This ensures bundle updates even if backend returns same bundle_id
  const calculateBestBundle = () => {
    if (!plan?.recommended_products || plan.recommended_products.length === 0) {
      return null;
    }
    
    const recommendedProductIds = new Set(
      plan.recommended_products.map((r) => r.product_id)
    );
    
    // Find bundle with best match score
    let bestBundle = null;
    let bestScore = -1;
    
    for (const b of bundleList) {
      const bundleItems = new Set(b.items || []);
      const matchCount = [...recommendedProductIds].filter((pid) =>
        bundleItems.has(pid)
      ).length;
      
      if (matchCount > bestScore && matchCount > 0) {
        bestScore = matchCount;
        bestBundle = b;
      }
    }
    
    // If backend provided a bundle_id, prefer it if it still matches
    if (plan.recommended_bundle_id) {
      const backendBundle = bundleList.find(
        (b) => b.bundle_id === plan.recommended_bundle_id
      );
      if (backendBundle) {
        const backendItems = new Set(backendBundle.items || []);
        const backendMatchCount = [...recommendedProductIds].filter((pid) =>
          backendItems.has(pid)
        ).length;
        // Use backend bundle if it matches at least as well as our calculated best
        if (backendMatchCount >= bestScore) {
          return backendBundle;
        }
      }
    }
    
    return bestBundle;
  };
  
  const bundle = calculateBestBundle();
  
  // Calculate monthly price: bundle price + products NOT in bundle
  const calculateMonthlyPrice = () => {
    if (!plan?.recommended_products || plan.recommended_products.length === 0) {
      return plan?.estimated_monthly ?? 0;
    }
    
    // Get unique recommended product IDs
    const recommendedProductIds = new Set(
      plan.recommended_products.map((r) => r.product_id)
    );
    
    let total = 0;
    
    // If we have a matching bundle, use bundle price for products in bundle
    if (bundle?.bundle_monthly && bundle.items) {
      const bundleItems = new Set(bundle.items);
      const productsInBundle = [...recommendedProductIds].filter((pid) =>
        bundleItems.has(pid)
      );
      
      // Add bundle price
      total += bundle.bundle_monthly;
      
      // Add prices for products NOT in bundle
      const productsNotInBundle = [...recommendedProductIds].filter(
        (pid) => !bundleItems.has(pid)
      );
      
      for (const productId of productsNotInBundle) {
        total += productMap[productId]?.price ?? 0;
      }
    } else {
      // No bundle match: sum all individual product prices
      const seenProducts = new Set<string>();
      total = plan.recommended_products.reduce((sum, r) => {
        if (!seenProducts.has(r.product_id)) {
          seenProducts.add(r.product_id);
          return sum + (productMap[r.product_id]?.price ?? 0);
        }
        return sum;
      }, 0);
    }
    
    // Use backend estimated_monthly if provided and seems reasonable
    if (plan.estimated_monthly && Math.abs(plan.estimated_monthly - total) < 10) {
      return plan.estimated_monthly;
    }
    
    return total;
  };
  
  const calculatedMonthly = calculateMonthlyPrice();

  // Debug: Log when plan updates (after calculations)
  useEffect(() => {
    if (plan?.recommended_products && catalog) {
      console.log("SmartHomePlan: Plan updated", {
        productCount: plan.recommended_products.length,
        products: plan.recommended_products.map(r => `${r.room}: ${r.product_id}`),
        backendBundle: plan.recommended_bundle_id,
        recalculatedBundle: bundle?.bundle_id || "none",
        bundleName: bundle?.name || "none",
        monthly: calculatedMonthly,
      });
    }
  }, [plan?.recommended_products, plan?.recommended_bundle_id, plan?.estimated_monthly, catalog, bundle, calculatedMonthly]);

  if (!isVisible) {
    return (
      <div className="card-premium p-6 h-full flex flex-col items-center justify-center min-h-[500px]">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <Wifi className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Your Smart Home Plan</h3>
          <p className="text-sm text-muted-foreground">
            Upload your layout or describe your home to see personalized recommendations.
          </p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const layoutType =
    (plan.layout && typeof plan.layout === "object" && "layout_type" in plan.layout
      ? String((plan.layout as { layout_type?: string }).layout_type)
      : "Home") || "Home";
  const personaName =
    (plan.persona && typeof plan.persona === "object" && "profile" in plan.persona
      ? (plan.persona as { profile?: { name?: string } }).profile?.name
      : null) ?? "You";

  const rooms: Array<{
    room: string;
    product: string;
    benefit: string;
    price: number;
    icon: LucideIcon;
  }> = (plan.recommended_products ?? []).map((r: RecommendationItem) => ({
    room: r.room,
    product: productMap[r.product_id]?.name ?? r.product_id,
    benefit: r.why,
    price: productMap[r.product_id]?.price ?? 0,
    icon: getIconForRoom(r.room),
  }));

  const priorities = [
    { icon: Shield, label: "Security" },
    { icon: Tv, label: "Entertainment" },
    { icon: Wifi, label: "Connectivity" },
  ];

  return (
    <div className="card-premium p-6 h-full animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h2 className="text-lg font-semibold text-foreground">Your Smart Home Plan</h2>
        </div>

        <div className="bg-secondary/50 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Layout</p>
              <p className="text-sm font-medium text-foreground capitalize">{layoutType}</p>
            </div>
            <div className="w-px h-8 bg-border hidden sm:block" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Persona</p>
              <p className="text-sm font-medium text-foreground">{personaName}</p>
            </div>
          </div>

          <div className="flex gap-3">
            {priorities.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 shadow-sm"
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
          Room-by-Room Recommendations
        </h3>
        <div className="space-y-3">
          {rooms.map((room, index) => (
            <RoomCard key={`${room.room}-${index}`} {...room} delay={0.1 * (index + 1)} />
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-5 border border-primary/10">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Recommended Smart Living Bundle
          </h3>
        </div>

        <div className="mb-4">
          <h4 className="text-xl font-bold text-foreground mb-3">
            {bundle?.name ?? "Smart Home Bundle"}
          </h4>
          <div className="flex flex-wrap gap-2">
            {(bundle?.items ?? []).map((itemId) => {
              const name = productMap[itemId]?.name ?? itemId;
              return (
                <div
                  key={itemId}
                  className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">{name}</span>
                </div>
              );
            })}
          </div>
          {/* Show additional products not in bundle */}
          {bundle && plan?.recommended_products && (() => {
            const bundleItems = new Set(bundle.items || []);
            const recommendedProductIds = new Set(
              plan.recommended_products.map((r) => r.product_id)
            );
            const additionalProducts = [...recommendedProductIds].filter(
              (pid) => !bundleItems.has(pid)
            );
            
            if (additionalProducts.length > 0) {
              return (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Additional products:</p>
                  <div className="flex flex-wrap gap-2">
                    {additionalProducts.map((itemId) => {
                      const name = productMap[itemId]?.name ?? itemId;
                      const price = productMap[itemId]?.price ?? 0;
                      return (
                        <div
                          key={itemId}
                          className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 shadow-sm"
                        >
                          <span className="text-xs font-medium text-foreground">{name}</span>
                          <span className="text-xs text-muted-foreground">+AED {price}/mo</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Monthly price</p>
            <p className="text-3xl font-bold text-foreground">
              AED {calculatedMonthly}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
            {/* Show breakdown if bundle + additional products */}
            {bundle && plan?.recommended_products && (() => {
              const bundleItems = new Set(bundle.items || []);
              const recommendedProductIds = new Set(
                plan.recommended_products.map((r) => r.product_id)
              );
              const additionalProducts = [...recommendedProductIds].filter(
                (pid) => !bundleItems.has(pid)
              );
              
              if (additionalProducts.length > 0 && bundle.bundle_monthly) {
                const additionalTotal = additionalProducts.reduce(
                  (sum, pid) => sum + (productMap[pid]?.price ?? 0),
                  0
                );
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    Bundle: AED {bundle.bundle_monthly}/mo + Additional: AED {additionalTotal}/mo
                  </p>
                );
              }
              return null;
            })()}
          </div>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-5 font-semibold shadow-button transition-all duration-300 hover:shadow-lg hover:scale-105">
            Upgrade My Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SmartHomePlan;
