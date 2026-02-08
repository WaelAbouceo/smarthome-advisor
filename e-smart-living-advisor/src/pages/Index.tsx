import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ChatPanel from "@/components/ChatPanel";
import LayoutSummary from "@/components/LayoutSummary";
import SmartHomePlan from "@/components/SmartHomePlan";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { AdvisorChatResponse, LayoutAnalysis } from "@/lib/api";
import * as api from "@/lib/api";

/**
 * Main application page - orchestrates chat panel and layout/plan display.
 * Handles layout state management and bidirectional synchronization between chat and layout panels.
 */
const Index = () => {
  const location = useLocation();
  const state = location.state as { layoutId?: string; layout?: LayoutAnalysis } | undefined;
  const [plan, setPlan] = useState<AdvisorChatResponse | null>(null);
  const [layout, setLayout] = useState<LayoutAnalysis | null>(null);
  const [layoutImageUrl, setLayoutImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"layout" | "plan">("layout");

  useEffect(() => {
    if (state?.layout) setLayout(state.layout);
  }, [state?.layout]);

  // Auto-switch to layout tab when layout is uploaded
  useEffect(() => {
    if (layout) {
      setActiveTab("layout");
    }
  }, [layout?.layout_id]); // Only trigger when layout_id changes (new upload)

  // Auto-switch to plan tab when plan is generated
  useEffect(() => {
    if (plan) {
      setActiveTab("plan");
    }
  }, [plan?.recommended_products?.length]); // Only trigger when plan content changes

  const handleLayoutAnalyzed = useCallback((analysis: LayoutAnalysis, imageUrl?: string) => {
    setLayoutImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return imageUrl ?? null;
    });
    setLayout(analysis);
  }, []);

  // BIDIRECTIONAL SYNC: Single source of truth handler
  // Called from both ChatPanel (chat → panel) and LayoutSummary (panel → chat)
  // Updates state and backend cache to keep everything in sync
  const handleLayoutChange = useCallback(async (updated: LayoutAnalysis) => {
    // Update state → triggers re-render of both ChatPanel and LayoutSummary
    setLayout(updated);
    // Update backend cache so advisor uses latest layout
    api.upsertLayoutCache(updated as unknown as Record<string, unknown>).catch(() => {
      // Cache update best-effort
    });
  }, []);

  useEffect(() => {
    return () => {
      if (layoutImageUrl) URL.revokeObjectURL(layoutImageUrl);
    };
  }, [layoutImageUrl]);

  return (
    <div className="min-h-screen gradient-hero">
      <Header />
      <Hero />

      <main className="container mx-auto px-4 sm:px-6 pb-16 pt-2">
        <div className="max-w-6xl mx-auto">
          <ResizablePanelGroup direction="horizontal" className="items-start">
            {/* Chat Panel - Independent height (not constrained by layout panel) */}
            <ResizablePanel defaultSize={45} minSize={25} maxSize={75} className="pr-3">
              <div className="animate-fade-in-up flex flex-col h-auto" style={{ animationDelay: "0.2s" }}>
                <p className="text-sm text-muted-foreground mb-2">
                  <Link to="/layout/upload" className="text-primary hover:underline">
                    Upload & edit floor plan
                  </Link>
                  {" "}to get a room-by-room layout, then confirm and get recommendations.
                </p>
                <div className="h-[600px] min-h-[500px]">
                  <ChatPanel
                    onPlanGenerated={(res) => setPlan(res)}
                    onLayoutAnalyzed={handleLayoutAnalyzed}
                    initialLayoutId={state?.layoutId ?? undefined}
                    onLayoutFromChat={(layout) => setLayout(layout)}
                    currentLayout={layout}
                    onLayoutUpdate={handleLayoutChange}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="mx-2" />

            {/* Layout Panel - Independent height (not constrained by chat panel) */}
            <ResizablePanel defaultSize={55} minSize={25} maxSize={75} className="pl-3">
              <div className="animate-fade-in-up flex flex-col gap-4 h-auto" style={{ animationDelay: "0.3s" }}>
                <Tabs 
                  value={activeTab} 
                  onValueChange={(v) => setActiveTab(v as "layout" | "plan")} 
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="layout" disabled={!layout}>
                      Your layout
                    </TabsTrigger>
                    <TabsTrigger value="plan" disabled={!plan}>
                      Your plan
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="layout" className="mt-4">
                    {layout ? (
                      <LayoutSummary
                        layout={layout}
                        imageUrl={layoutImageUrl}
                        onLayoutChange={handleLayoutChange}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                        <p>Upload a floor plan to see your layout here.</p>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="plan" className="mt-4">
                    {plan ? (
                      <div className={layout ? "flex-1 min-h-[360px]" : "flex-1"}>
                        <SmartHomePlan isVisible={!!plan} plan={plan} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                        <p>Get recommendations from the chat to see your smart home plan here.</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 e& | Emirates Telecommunications Group Company. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
