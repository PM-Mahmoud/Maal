import {
  Baby, Beer, Bike, Book, Briefcase, Bus, Camera, Car, Cat, Coffee, Dog, Droplet, Dumbbell, Film, Fuel, Gamepad2,
  Gift, Glasses, GraduationCap, Heart, Home, Hotel, Landmark, Laptop, Map as MapIcon, Music, Palette, PartyPopper,
  PawPrint, Phone, PiggyBank, Pill, Pizza, Plane, Receipt, Repeat, Scissors, Shirt, ShoppingBag, ShoppingCart, Sofa,
  Sparkles, Star, Stethoscope, Sun, Tag, Ticket, TrainFront, Tv, Umbrella, Utensils, Wallet, Wifi, Wine, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { iconForGroup } from "../overview/categoryIcons";
import type { CustomCategory } from "./api";

// Keys must match lib/spending-categories.js ICONS (server validates).
export const CUSTOM_ICONS: Array<[string, LucideIcon, string]> = [
  ["tag", Tag, "Tag"], ["shopping-bag", ShoppingBag, "Shopping bag"], ["shopping-cart", ShoppingCart, "Trolley"],
  ["coffee", Coffee, "Coffee"], ["utensils", Utensils, "Dining"], ["pizza", Pizza, "Pizza"], ["wine", Wine, "Wine"],
  ["beer", Beer, "Beer"], ["car", Car, "Car"], ["bus", Bus, "Bus"], ["train", TrainFront, "Train"], ["bike", Bike, "Bike"],
  ["fuel", Fuel, "Fuel"], ["plane", Plane, "Plane"], ["map", MapIcon, "Map"], ["hotel", Hotel, "Hotel"],
  ["home", Home, "Home"], ["sofa", Sofa, "Furniture"], ["wrench", Wrench, "Repairs"], ["zap", Zap, "Power"],
  ["droplet", Droplet, "Water"], ["wifi", Wifi, "Internet"], ["phone", Phone, "Phone"], ["tv", Tv, "TV"],
  ["heart", Heart, "Heart"], ["pill", Pill, "Medicine"], ["dumbbell", Dumbbell, "Fitness"], ["stethoscope", Stethoscope, "Doctor"],
  ["baby", Baby, "Baby"], ["dog", Dog, "Dog"], ["cat", Cat, "Cat"], ["paw", PawPrint, "Pets"],
  ["book", Book, "Book"], ["graduation-cap", GraduationCap, "Study"], ["music", Music, "Music"], ["film", Film, "Film"],
  ["gamepad", Gamepad2, "Games"], ["ticket", Ticket, "Tickets"], ["camera", Camera, "Camera"], ["palette", Palette, "Art"],
  ["gift", Gift, "Gift"], ["party", PartyPopper, "Party"], ["sun", Sun, "Holiday"], ["umbrella", Umbrella, "Umbrella"],
  ["shirt", Shirt, "Clothes"], ["glasses", Glasses, "Glasses"], ["scissors", Scissors, "Hair"], ["sparkles", Sparkles, "Beauty"],
  ["briefcase", Briefcase, "Work"], ["laptop", Laptop, "Laptop"], ["piggy-bank", PiggyBank, "Savings"], ["wallet", Wallet, "Wallet"],
  ["landmark", Landmark, "Bank"], ["receipt", Receipt, "Receipt"], ["repeat", Repeat, "Repeat"], ["star", Star, "Star"],
];
const BY_KEY = new Map(CUSTOM_ICONS.map(([k, I]) => [k, I]));

/** Icon + optional colour for a category name: custom categories carry their own. */
export function categoryLook(name: string, custom: CustomCategory[]): { Icon: LucideIcon; color: string | null } {
  const c = custom.find((x) => x.name === name);
  if (c) return { Icon: BY_KEY.get(c.icon) ?? Tag, color: c.color };
  return { Icon: iconForGroup(name), color: null };
}
