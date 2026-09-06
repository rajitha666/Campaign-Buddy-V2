/**
 * Central param-list definitions so `navigation.navigate(...)` calls are
 * type-checked. Add new screens/params here, not inline in each screen.
 */
export type HomeStackParamList = {
  Home: undefined;
  Products: undefined;
  /**
   * We pass the list item's already-fetched fields through as route params
   * (rather than just an id) to avoid a redundant round-trip on screen
   * entry — Home/Products already have this data from the list call.
   * `otherInterestedCustomers` is NOT in the list endpoint yet (see spec
   * §6.3) — TODO(backend): add it there, or add a dedicated
   * `GET /products/{cpaId}/stock` endpoint; until then this screen
   * defaults it to 0 on entry and relies on the PATCH response afterward.
   */
  ProductUpdate: {
    campaignProductAssignmentId: string;
    productId: string;
    productName: string;
    unitPrice: number;
    sku: string;
    openingStock: number;
    soldToday: number;
    reorderFlag: boolean;
    bandColor: string;
  };
  StatsUpdate: undefined;
  Profile: undefined;
};

export type AttendanceStackParamList = {
  Attendance: undefined;
  TimeOff: undefined;
};

export type SalesStackParamList = {
  SalesSummary: undefined;
};

export type PerformanceStackParamList = {
  Performance: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  SalesTab: undefined;
  AttendanceTab: undefined;
  PerformanceTab: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
};
