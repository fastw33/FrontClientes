import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  Package,
  PackagePlus,
  ShieldCheck,
  Truck,
} from 'lucide-react'

export const navigation = [
  { path: '/inicio', label: 'Inicio', icon: LayoutDashboard },
  {
    path: '/inventario',
    label: 'Mi inventario',
    icon: Package,
    description: 'Consulta tus productos y las cantidades disponibles.',
    action: 'Tu inventario, siempre a la vista.',
  },
  {
    path: '/precargas',
    label: 'Precargas',
    icon: PackagePlus,
    description: 'Prepara la información de tu mercancía antes de su llegada.',
    action: 'Cada llegada empieza con un buen plan.',
  },
  {
    path: '/operaciones',
    label: 'Mis operaciones',
    icon: Truck,
    description: 'Solicita la preparación de tu mercancía y sigue su avance.',
    action: 'Tu próximo despacho empieza aquí.',
  },
  {
    path: '/movimientos',
    label: 'Movimientos',
    icon: ArrowLeftRight,
    description: 'Revisa los ingresos y salidas de tus productos.',
    action: 'La historia de tu operación, en orden.',
  },
  {
    path: '/documentos',
    label: 'Mis documentos',
    icon: FileText,
    description: 'Encuentra los documentos asociados a tus operaciones.',
    action: 'Todo lo importante, en un solo lugar.',
  },
  { path: '/seguridad', label: 'Mi cuenta y seguridad', icon: ShieldCheck },
]
