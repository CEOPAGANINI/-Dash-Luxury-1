import {
  SolarIcon,
  type SolarIconName,
  type SolarIconProps,
} from "@/components/command-layer/solar-icon";

type IconProps = Omit<SolarIconProps, "name">;

/** Local aliases keep presentation icons separate from the VPS behavior. */
function solar(name: SolarIconName) {
  return function VpsIcon(props: IconProps) {
    return <SolarIcon name={name} {...props} />;
  };
}

export const ArrowRight = solar("arrow-right");
export const ArrowUpRight = solar("arrow-right-up");
export const Box = solar("layers");
export const Check = solar("check-circle");
export const Cpu = solar("cpu");
export const FileArchive = solar("file-zip");
export const FileCode2 = solar("file-code");
export const Folder = solar("folder");
export const Globe2 = solar("global");
export const HardDrive = solar("server");
export const Layers3 = solar("layers");
export const LockKeyhole = solar("lock-keyhole");
export const Monitor = solar("monitor");
export const Network = solar("server-path");
export const Plus = solar("add-square");
export const Server = solar("server-square");
export const ShieldCheck = solar("shield-check");
export const Terminal = solar("code-square");
export const Upload = solar("upload");
