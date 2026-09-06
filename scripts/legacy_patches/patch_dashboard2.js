const fs = require('fs');
const path = 'frontend/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    'import { BookOpen, CalendarDays, Check, CheckSquare, Columns3, FileText, Grid3X3, LayoutGrid, Pencil, SlidersHorizontal, X } from "lucide-react";',
    'import { BookOpen, CalendarDays, Check, CheckSquare, Columns3, FileText, Grid3X3, LayoutGrid, Pencil, SlidersHorizontal, X, Search } from "lucide-react";'
);

content = content.replace(
    'export default function Dashboard({ user, token, onNavigate }) {',
    'export default function Dashboard({ user, token, onNavigate, onOpenSearch, searchShortcutLabel }) {'
);

fs.writeFileSync(path, content);
console.log("Patched again!");
