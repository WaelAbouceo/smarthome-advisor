import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Users, Package, FileText, Code, Loader2, Copy, Check } from "lucide-react";
import * as api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";

export default function AdminPanel() {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch all admin data
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.getAdminUsers,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: api.getAdminProducts,
  });

  const { data: promptsData, isLoading: promptsLoading } = useQuery({
    queryKey: ["admin-prompts"],
    queryFn: api.getAdminPrompts,
  });

  const { data: businessRulesData, isLoading: businessRulesLoading } = useQuery({
    queryKey: ["admin-business-rules"],
    queryFn: api.getAdminBusinessRules,
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-7xl mt-20">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage users, products, business rules, and prompts
          </p>
        </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users ({usersData?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Products ({productsData?.products?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Code className="w-4 h-4" />
            Business Rules
          </TabsTrigger>
          <TabsTrigger value="prompts" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Prompts ({promptsData?.total ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Users List</CardTitle>
              <CardDescription>
                All customer profiles from CRM ({usersData?.total ?? 0} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {usersData?.users?.map((user: any) => (
                      <Card key={user.customer_id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{user.name}</h3>
                              <Badge variant="outline">{user.segment}</Badge>
                              {user.city && (
                                <Badge variant="secondary">{user.city}</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">ID:</span> {user.customer_id}
                              </div>
                              {user.revenue?.monthly_aed && (
                                <div>
                                  <span className="font-medium">Revenue:</span> AED {user.revenue.monthly_aed}/mo
                                </div>
                              )}
                              {user.account_age_years && (
                                <div>
                                  <span className="font-medium">Account Age:</span> {user.account_age_years} years
                                </div>
                              )}
                              {user.household && (
                                <div>
                                  <span className="font-medium">Household:</span> {user.household.adults} adults
                                  {user.household.kids > 0 && `, ${user.household.kids} kids`}
                                </div>
                              )}
                            </div>
                            {user.devices && user.devices.length > 0 && (
                              <div className="mt-2 text-sm">
                                <span className="font-medium">Devices:</span>{" "}
                                {user.devices.map((d: any) => d.type.replace("_", " ")).join(", ")}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(JSON.stringify(user, null, 2), user.customer_id)}
                          >
                            {copiedId === user.customer_id ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Product Catalog</CardTitle>
              <CardDescription>
                All available products and bundles ({productsData?.products?.length ?? 0} products, {productsData?.bundles?.length ?? 0} bundles)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Tabs defaultValue="products-list">
                  <TabsList>
                    <TabsTrigger value="products-list">Products</TabsTrigger>
                    <TabsTrigger value="bundles-list">Bundles</TabsTrigger>
                  </TabsList>
                  <TabsContent value="products-list" className="mt-4">
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-4">
                        {productsData?.products?.map((product: any) => (
                          <Card key={product.product_id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="font-semibold">{product.name}</h3>
                                  <Badge variant="outline">{product.category}</Badge>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-2">
                                  <div>
                                    <span className="font-medium">ID:</span> {product.product_id}
                                  </div>
                                  {product.price_monthly && (
                                    <div>
                                      <span className="font-medium">Monthly:</span> AED {product.price_monthly}
                                    </div>
                                  )}
                                  {product.price_one_time && (
                                    <div>
                                      <span className="font-medium">One-time:</span> AED {product.price_one_time}
                                    </div>
                                  )}
                                  {product.priority && (
                                    <div>
                                      <span className="font-medium">Priority:</span> {product.priority}
                                    </div>
                                  )}
                                </div>
                                {product.tags && product.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {product.tags.map((tag: string) => (
                                      <Badge key={tag} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {product.notes && (
                                  <p className="text-sm text-muted-foreground">{product.notes}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(product, null, 2), product.product_id)}
                              >
                                {copiedId === product.product_id ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="bundles-list" className="mt-4">
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-4">
                        {productsData?.bundles?.map((bundle: any) => (
                          <Card key={bundle.bundle_id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="font-semibold">{bundle.name}</h3>
                                  <Badge variant="outline">Bundle</Badge>
                                  {bundle.bundle_monthly && (
                                    <Badge variant="secondary">AED {bundle.bundle_monthly}/mo</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground mb-2">
                                  <span className="font-medium">ID:</span> {bundle.bundle_id}
                                </div>
                                {bundle.items && bundle.items.length > 0 && (
                                  <div className="mb-2">
                                    <span className="font-medium text-sm">Items:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {bundle.items.map((item: string) => (
                                        <Badge key={item} variant="secondary" className="text-xs">
                                          {item}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {bundle.bundle_notes && (
                                  <p className="text-sm text-muted-foreground">{bundle.bundle_notes}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(bundle, null, 2), bundle.bundle_id)}
                              >
                                {copiedId === bundle.bundle_id ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Rules Tab */}
        <TabsContent value="rules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Rules Logic</CardTitle>
              <CardDescription>
                Rule-based recommendation logic and RAG knowledge base
              </CardDescription>
            </CardHeader>
            <CardContent>
              {businessRulesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Rule-based Recommender */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Rule-Based Recommender</CardTitle>
                      <CardDescription>{businessRulesData?.rule_based_recommender?.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs text-muted-foreground">
                          {businessRulesData?.rule_based_recommender?.file}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              businessRulesData?.rule_based_recommender?.code || "",
                              "rule-based-code"
                            )
                          }
                        >
                          {copiedId === "rule-based-code" ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <ScrollArea className="h-[300px] rounded-md border p-4 bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {businessRulesData?.rule_based_recommender?.code}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* RAG Retriever */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">RAG Retriever</CardTitle>
                      <CardDescription>{businessRulesData?.rag_retriever?.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs text-muted-foreground">
                          {businessRulesData?.rag_retriever?.file}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              businessRulesData?.rag_retriever?.code || "",
                              "rag-code"
                            )
                          }
                        >
                          {copiedId === "rag-code" ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <ScrollArea className="h-[300px] rounded-md border p-4 bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {businessRulesData?.rag_retriever?.code}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Knowledge Base */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Knowledge Base</CardTitle>
                      <CardDescription>RAG knowledge base for product recommendations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[400px] rounded-md border p-4 bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {JSON.stringify(businessRulesData?.knowledge_base, null, 2)}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* LLM Recommender Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">LLM Recommender</CardTitle>
                      <CardDescription>{businessRulesData?.llm_recommender?.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">File:</span>{" "}
                          <code className="text-xs">{businessRulesData?.llm_recommender?.file}</code>
                        </div>
                        <div>
                          <span className="font-medium">Note:</span> {businessRulesData?.llm_recommender?.note}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompts Tab */}
        <TabsContent value="prompts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Prompts</CardTitle>
              <CardDescription>
                LLM system prompts ({promptsData?.total ?? 0} prompts from {promptsData?.prompts_dir})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {promptsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(promptsData?.prompts || {}).map(([name, content]) => (
                    <Card key={name}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{name}</CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(content as string, name)}
                          >
                            {copiedId === name ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[400px] rounded-md border p-4 bg-muted/30">
                          <pre className="text-xs font-mono whitespace-pre-wrap">{content as string}</pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
