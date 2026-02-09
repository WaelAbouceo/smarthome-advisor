import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, User, MapPin, Users, DollarSign, Smartphone, Calendar, CreditCard } from "lucide-react";

interface MockUser {
  customer_id: string;
  name: string;
  segment: string;
  city?: string;
  household: {
    adults: number;
    kids: number;
    pets: number;
  };
  usage: {
    streaming_heavy?: boolean;
    work_from_home?: boolean;
    gaming?: boolean;
    security_sensitive?: boolean;
  };
  revenue?: {
    monthly_aed?: number;
    annual_aed?: number;
  };
  devices?: Array<{
    type: string;
    brand?: string;
    model?: string;
  }>;
  account_age_years?: number;
  contract_type?: string;
  payment_method?: string;
  previous_purchases?: string[];
}

// Mock users data (matching backend mock_crm_profiles.json)
const MOCK_USERS: Record<string, MockUser> = {
  CUST_1001: {
    customer_id: "CUST_1001",
    name: "Wael",
    segment: "Premium",
    city: "Cairo",
    household: { adults: 2, kids: 2, pets: 0 },
    usage: { streaming_heavy: true, work_from_home: true, security_sensitive: true },
    revenue: { monthly_aed: 650, annual_aed: 7800 },
    devices: [{ type: "smart_speaker", brand: "Amazon", model: "Echo Dot 4th Gen" }, { type: "smart_bulb", brand: "Philips", model: "Hue White" }],
    account_age_years: 3.5,
    contract_type: "annual",
    payment_method: "auto_pay",
  },
  CUST_2002: {
    customer_id: "CUST_2002",
    name: "Maha",
    segment: "Mid",
    city: "Dubai",
    household: { adults: 1, kids: 0, pets: 1 },
    usage: { streaming_heavy: true, gaming: true },
    revenue: { monthly_aed: 350, annual_aed: 4200 },
    devices: [{ type: "smart_tv", brand: "Samsung", model: "55\" QLED" }],
    account_age_years: 1.2,
    contract_type: "monthly",
    payment_method: "credit_card",
  },
  CUST_3003: {
    customer_id: "CUST_3003",
    name: "Ahmed",
    segment: "Value",
    city: "Abu Dhabi",
    household: { adults: 1, kids: 0, pets: 0 },
    usage: {},
    revenue: { monthly_aed: 150, annual_aed: 1800 },
    devices: [],
    account_age_years: 0.5,
    contract_type: "monthly",
    payment_method: "debit_card",
  },
  CUST_4004: {
    customer_id: "CUST_4004",
    name: "Fatima",
    segment: "Premium",
    city: "Dubai",
    household: { adults: 2, kids: 3, pets: 2 },
    usage: { streaming_heavy: true, work_from_home: true, gaming: true, security_sensitive: true },
    revenue: { monthly_aed: 850, annual_aed: 10200 },
    devices: [
      { type: "smart_speaker", brand: "Google", model: "Nest Mini" },
      { type: "smart_lock", brand: "Yale", model: "Assure Lock" },
      { type: "smart_thermostat", brand: "Nest", model: "Learning Thermostat" },
      { type: "smart_camera", brand: "Ring", model: "Indoor Cam" },
    ],
    account_age_years: 5.0,
    contract_type: "annual",
    payment_method: "auto_pay",
    previous_purchases: ["P_SMART_DOOR_LOCK", "P_SMART_INDOOR_CAMERA"],
  },
  CUST_5005: {
    customer_id: "CUST_5005",
    name: "Omar",
    segment: "Mid",
    city: "Sharjah",
    household: { adults: 2, kids: 1, pets: 0 },
    usage: { streaming_heavy: true, work_from_home: true, security_sensitive: true },
    revenue: { monthly_aed: 450, annual_aed: 5400 },
    devices: [{ type: "smart_speaker", brand: "Amazon", model: "Echo Show 8" }, { type: "smart_bulb", brand: "TP-Link", model: "Kasa Smart Bulb" }],
    account_age_years: 2.3,
    contract_type: "monthly",
    payment_method: "credit_card",
  },
  CUST_6006: {
    customer_id: "CUST_6006",
    name: "Sarah",
    segment: "Premium",
    city: "Dubai",
    household: { adults: 1, kids: 0, pets: 0 },
    usage: { work_from_home: true, security_sensitive: true },
    revenue: { monthly_aed: 600, annual_aed: 7200 },
    devices: [{ type: "smart_lock", brand: "August", model: "Smart Lock Pro" }, { type: "smart_camera", brand: "Arlo", model: "Essential Spotlight" }],
    account_age_years: 4.2,
    contract_type: "annual",
    payment_method: "bank_transfer",
    previous_purchases: ["P_SMART_DOOR_LOCK"],
  },
  CUST_7007: {
    customer_id: "CUST_7007",
    name: "Khalid",
    segment: "Value",
    city: "Ajman",
    household: { adults: 2, kids: 2, pets: 0 },
    usage: { streaming_heavy: true },
    revenue: { monthly_aed: 200, annual_aed: 2400 },
    devices: [{ type: "smart_tv", brand: "LG", model: "43\" LED" }],
    account_age_years: 0.8,
    contract_type: "monthly",
    payment_method: "debit_card",
  },
  CUST_8008: {
    customer_id: "CUST_8008",
    name: "Layla",
    segment: "Mid",
    city: "Dubai",
    household: { adults: 1, kids: 1, pets: 1 },
    usage: { streaming_heavy: true, gaming: true, security_sensitive: true },
    revenue: { monthly_aed: 380, annual_aed: 4560 },
    devices: [{ type: "smart_speaker", brand: "Apple", model: "HomePod Mini" }, { type: "smart_bulb", brand: "Nanoleaf", model: "Essentials A19" }],
    account_age_years: 1.8,
    contract_type: "monthly",
    payment_method: "credit_card",
  },
  CUST_9009: {
    customer_id: "CUST_9009",
    name: "Youssef",
    segment: "Premium",
    city: "Abu Dhabi",
    household: { adults: 2, kids: 0, pets: 0 },
    usage: { streaming_heavy: true, work_from_home: true, gaming: true, security_sensitive: true },
    revenue: { monthly_aed: 900, annual_aed: 10800 },
    devices: [
      { type: "smart_speaker", brand: "Amazon", model: "Echo Studio" },
      { type: "smart_tv", brand: "Sony", model: "65\" OLED" },
      { type: "smart_lock", brand: "Schlage", model: "Encode Plus" },
      { type: "smart_thermostat", brand: "Ecobee", model: "SmartThermostat" },
      { type: "smart_camera", brand: "Ring", model: "Video Doorbell Pro" },
    ],
    account_age_years: 6.5,
    contract_type: "annual",
    payment_method: "auto_pay",
    previous_purchases: ["P_WIFI_MESH_PRO", "P_SMART_DOOR_LOCK"],
  },
  CUST_1010: {
    customer_id: "CUST_1010",
    name: "Noor",
    segment: "Value",
    city: "Ras Al Khaimah",
    household: { adults: 1, kids: 0, pets: 0 },
    usage: { work_from_home: true },
    revenue: { monthly_aed: 120, annual_aed: 1440 },
    devices: [],
    account_age_years: 0.3,
    contract_type: "monthly",
    payment_method: "debit_card",
  },
};

const LoginPage = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    if (!selectedCustomerId) return;

    const userData = MOCK_USERS[selectedCustomerId];
    if (userData) {
      login(selectedCustomerId, {
        customer_id: userData.customer_id,
        name: userData.name,
        segment: userData.segment,
        city: userData.city,
      });
      navigate("/");
    }
  };

  const selectedUser = selectedCustomerId ? MOCK_USERS[selectedCustomerId] : null;

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl">Smart Living AI buddy</CardTitle>
          <CardDescription className="text-lg mt-2">
            Sign in to get personalized smart home recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select User Profile</label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a user profile to continue..." />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MOCK_USERS).map((user) => (
                  <SelectItem key={user.customer_id} value={user.customer_id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      <Badge variant={user.segment === "Premium" ? "default" : user.segment === "Mid" ? "secondary" : "outline"}>
                        {user.segment}
                      </Badge>
                      {user.city && (
                        <span className="text-xs text-muted-foreground">• {user.city}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUser && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedUser.name}</span>
                    <Badge variant={selectedUser.segment === "Premium" ? "default" : selectedUser.segment === "Mid" ? "secondary" : "outline"}>
                      {selectedUser.segment}
                    </Badge>
                  </div>

                  {selectedUser.city && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{selectedUser.city}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>
                      {selectedUser.household.adults} adult{selectedUser.household.adults !== 1 ? "s" : ""}
                      {selectedUser.household.kids > 0 && `, ${selectedUser.household.kids} kid${selectedUser.household.kids !== 1 ? "s" : ""}`}
                      {selectedUser.household.pets > 0 && `, ${selectedUser.household.pets} pet${selectedUser.household.pets !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {Object.keys(selectedUser.usage).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedUser.usage.streaming_heavy && (
                        <Badge variant="outline" className="text-xs">Streaming</Badge>
                      )}
                      {selectedUser.usage.work_from_home && (
                        <Badge variant="outline" className="text-xs">Work from Home</Badge>
                      )}
                      {selectedUser.usage.gaming && (
                        <Badge variant="outline" className="text-xs">Gaming</Badge>
                      )}
                      {selectedUser.usage.security_sensitive && (
                        <Badge variant="outline" className="text-xs">Security</Badge>
                      )}
                    </div>
                  )}

                  {/* Revenue */}
                  {selectedUser.revenue?.monthly_aed && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      <span>Monthly Revenue: AED {selectedUser.revenue.monthly_aed.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Account Age */}
                  {selectedUser.account_age_years !== undefined && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Customer for {selectedUser.account_age_years.toFixed(1)} years</span>
                    </div>
                  )}

                  {/* Contract & Payment */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {selectedUser.contract_type && (
                      <div className="flex items-center gap-1">
                        <CreditCard className="h-4 w-4" />
                        <span className="capitalize">{selectedUser.contract_type}</span>
                      </div>
                    )}
                    {selectedUser.payment_method && (
                      <div className="flex items-center gap-1">
                        <span className="capitalize">{selectedUser.payment_method.replace("_", " ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Existing Devices */}
                  {selectedUser.devices && selectedUser.devices.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Smartphone className="h-4 w-4" />
                        <span>Existing Devices ({selectedUser.devices.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pl-6">
                        {selectedUser.devices.map((device, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {device.type.replace("_", " ")}
                            {device.brand && ` • ${device.brand}`}
                            {device.model && ` ${device.model}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Previous Purchases */}
                  {selectedUser.previous_purchases && selectedUser.previous_purchases.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      <div className="text-sm font-medium">Previous Purchases</div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {selectedUser.previous_purchases.map((purchase, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {purchase}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleLogin}
            disabled={!selectedCustomerId}
            className="w-full"
            size="lg"
          >
            Sign In
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            This is a demo application. Select a user profile to experience personalized recommendations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
