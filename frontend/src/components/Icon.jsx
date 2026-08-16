import React from 'react';
import * as Lucide from 'lucide-react';

// Custom cameraSwitch icon replicating previous Material path (kept to not lose visual cue)
const CameraSwitchLegacy = ({ size = 22, color = 'currentColor', ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    role="img"
    aria-label="camera switch"
    {...rest}
  >
    <path d="M12 5c-3.86 0-7 3.14-7 7H2l3.89 3.89.07.14L10 12H7c0-2.76 2.24-5 5-5 1.64 0 3.09.8 4 2.02l1.46-1.46C16.17 6.42 14.21 5 12 5zm7.11 3.11L14 12h3c0 2.76-2.24 5-5 5-1.64 0-3.09-.8-4-2.02L6.54 16.44C7.83 17.58 9.79 19 12 19c3.86 0 7-3.14 7-7h3l-3.89-3.89-.07-.14z" />
  </svg>
);

// Map semantic names to Lucide icons (fallback to custom ones if needed)
const ICON_MAP = {
  // General UI
  close: Lucide.X,
  warning: Lucide.AlertCircle,
  info: Lucide.Info,
  success: Lucide.CheckCircle2,
  error: Lucide.AlertTriangle,
  clock: Lucide.Clock,
  calendar: Lucide.Calendar,
  user: Lucide.User,
  logout: Lucide.LogOut,
  settings: Lucide.Settings,
  menu: Lucide.Menu,
  theme: Lucide.SunMedium,
  dark: Lucide.MoonStar,
  qr: Lucide.QrCode,
  download: Lucide.Download,
  edit: Lucide.Edit3,
  delete: Lucide.Trash2,
  plus: Lucide.Plus,
  minus: Lucide.Minus,
  refresh: Lucide.RefreshCcw,

  // Camera / media
  camera: Lucide.Camera,
  cameraOff: Lucide.CameraOff,
  cameraSwitch: CameraSwitchLegacy, // custom retained
  flash: Lucide.Zap,
  flashOff: Lucide.ZapOff,
  gallery: Lucide.Images,

  // Eyes
  eye: Lucide.Eye,
  eyeOff: Lucide.EyeOff,

  // Status / actions
  save: Lucide.Save,
  search: Lucide.Search,
  filter: Lucide.Filter,
  upload: Lucide.UploadCloud,
  file: Lucide.FileText,
  history: Lucide.History,
  list: Lucide.List,
};

export function Icon({ name, size = 22, color = 'currentColor', stroke = 2, className = '', ...rest }) {
  const Entry = ICON_MAP[name];
  if (!Entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Icon] Icon name not found:', name);
    }
    return null;
  }
  // If it's a Lucide icon (function with prop strokeWidth), render with stroke
  const isLucide = Entry !== CameraSwitchLegacy;
  return (
    <Entry
      size={size}
      color={color}
      strokeWidth={isLucide ? stroke : undefined}
      className={`app-icon ${className}`.trim()}
      {...rest}
    />
  );
}

export default Icon;
