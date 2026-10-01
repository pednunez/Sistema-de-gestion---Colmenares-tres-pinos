import { useContext } from "react";
import { AuthContext } from "../context/contextos";

export function useAuth() {
  return useContext(AuthContext);
}
