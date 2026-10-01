import { useContext } from "react";
import { NavegacionContext } from "../context/contextos";

export function useNavegacion() {
  return useContext(NavegacionContext);
}
