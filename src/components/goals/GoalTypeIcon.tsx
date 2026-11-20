import { Car, GraduationCap, Home, LifeBuoy, Plane, ShoppingBag, Target, TrendingUp, Wallet } from "lucide-react";

/** Ícone do tipo de meta (componente fixo; não cria componentes durante a renderização). */
export function GoalTypeIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "TRAVEL":
      return <Plane className={className} />;
    case "PURCHASE":
      return <ShoppingBag className={className} />;
    case "EMERGENCY_RESERVE":
      return <LifeBuoy className={className} />;
    case "EDUCATION":
      return <GraduationCap className={className} />;
    case "HOME":
      return <Home className={className} />;
    case "VEHICLE":
      return <Car className={className} />;
    case "INVESTMENT":
      return <TrendingUp className={className} />;
    case "DEBT_REPAYMENT":
      return <Wallet className={className} />;
    default:
      return <Target className={className} />;
  }
}
