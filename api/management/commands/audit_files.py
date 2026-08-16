from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import Equipo, Buque, EntrenamientoDoc, SolicitudMejoras, SolicitudRequerimientos
import os
import json


def _collect_from_docs_field(arr):
    out = set()
    for d in arr or []:
        try:
            url = d.get("url") or ""
            rel = str(url).lstrip("/")
            if rel:
                out.add(os.path.normpath(os.path.join(settings.BASE_DIR, rel)))
        except Exception:
            continue
    return out


class Command(BaseCommand):
    help = "Audit filesystem vs DB: report referenced-but-missing and unreferenced files under media/"

    def add_arguments(self, parser):
        parser.add_argument("--out", help="Write JSON report to this path (optional)")
        parser.add_argument(
            "--scan-dir",
            default=os.path.join(settings.BASE_DIR, "media"),
            help="Directory to scan (default: <BASE_DIR>/media)",
        )

    def handle(self, *args, **options):
        base_dir = settings.BASE_DIR
        scan_root = options.get("scan_dir")
        out_path = options.get("out")

        # Collect referenced files from multiple models
        referenced = set()

        # Equipo.documentos
        for eq in Equipo.objects.all().only("documentos"):
            referenced |= _collect_from_docs_field(eq.documentos)

        # Buque.documentos
        for b in Buque.objects.all().only("documentos"):
            referenced |= _collect_from_docs_field(b.documentos)

        # EntrenamientoDoc.presentacion / acta
        for e in EntrenamientoDoc.objects.all().only("presentacion", "acta"):
            if getattr(e, "presentacion", None):
                try:
                    referenced.add(os.path.normpath(os.path.join(base_dir, str(e.presentacion.name))))
                except Exception:
                    pass
            if getattr(e, "acta", None):
                try:
                    referenced.add(os.path.normpath(os.path.join(base_dir, str(e.acta.name))))
                except Exception:
                    pass

        # SolicitudMejoras.documento and SolicitudRequerimientos.documento
        for s in SolicitudMejoras.objects.all().only("documento"):
            referenced |= _collect_from_docs_field(s.documento)
        for s in SolicitudRequerimientos.objects.all().only("documento"):
            referenced |= _collect_from_docs_field(s.documento)

        # Walk scan_root and collect all files
        existing_files = set()
        for root, dirs, files in os.walk(scan_root):
            for fn in files:
                existing_files.add(os.path.normpath(os.path.join(root, fn)))

        # Compute diffs
        referenced_but_missing = sorted(list(referenced - existing_files))
        existing_but_unreferenced = sorted(list(existing_files - referenced))

        report = {
            "scan_root": scan_root,
            "referenced_count": len(referenced),
            "existing_count": len(existing_files),
            "referenced_but_missing_count": len(referenced_but_missing),
            "existing_but_unreferenced_count": len(existing_but_unreferenced),
            "referenced_but_missing": referenced_but_missing,
            "existing_but_unreferenced_sample": existing_but_unreferenced[:500],
        }

        self.stdout.write(self.style.WARNING(json.dumps({
            "scan_root": scan_root,
            "referenced_count": len(referenced),
            "existing_count": len(existing_files),
            "referenced_but_missing_count": len(referenced_but_missing),
            "existing_but_unreferenced_count": len(existing_but_unreferenced),
        }, indent=2, ensure_ascii=False)))

        if out_path:
            try:
                with open(out_path, "w", encoding="utf-8") as fo:
                    json.dump(report, fo, ensure_ascii=False, indent=2)
                self.stdout.write(self.style.SUCCESS(f"Report written to {out_path}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Could not write report: {e}"))
        else:
            # If not writing, show small summaries
            if referenced_but_missing:
                self.stdout.write(self.style.ERROR("Referenced but missing files (first 100):"))
                for p in referenced_but_missing[:100]:
                    self.stdout.write(p)
            if existing_but_unreferenced:
                self.stdout.write(self.style.WARNING("Existing but unreferenced files (sample up to 100):"))
                for p in existing_but_unreferenced[:100]:
                    self.stdout.write(p)

        # Also write full lists to files in project root for manual inspection
        try:
            root_out = os.path.join(base_dir, "scripts")
            os.makedirs(root_out, exist_ok=True)
            with open(os.path.join(root_out, "referenced_but_missing.txt"), "w", encoding="utf-8") as fo:
                for p in referenced_but_missing:
                    fo.write(p + "\n")
            with open(os.path.join(root_out, "existing_but_unreferenced.txt"), "w", encoding="utf-8") as fo:
                for p in existing_but_unreferenced:
                    fo.write(p + "\n")
            self.stdout.write(self.style.SUCCESS(f"Wrote full lists to {root_out}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Could not write full lists: {e}"))
