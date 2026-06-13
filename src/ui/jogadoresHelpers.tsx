import { norm } from "../utils/format";
import { canonicalCourseName } from "../utils/courseAliases";

/* —— Course key lookup: course display name → courseKey for /campos/:courseKey —— */
let _courseKeyMap: Map<string, string> = new Map();

/** Normalização robusta: nome canónico (resolve aliases) + sem pontuação, para
 *  "Villa Padierna Flamingos" (ronda) casar com "Villa Padierna - Flamingos"
 *  (campo) e "Golden Palm" com "Trump Doral - Golden Palm". */
function ckNorm(s: string): string {
  return norm(canonicalCourseName(s) || s).replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildCourseKeyMap(courses: any[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of courses) {
    m.set(ckNorm(c.master.name), c.courseKey);
    m.set(ckNorm(c.courseKey), c.courseKey);
  }
  return m;
}

export function findCourseKey(courseName: string): string | null {
  return _courseKeyMap.get(ckNorm(courseName)) ?? null;
}

export function setCourseKeyMap(map: Map<string, string>) {
  _courseKeyMap = map;
}

/* ─── Course name + arrow → /campos/:courseKey (abre em nova janela) ───
   O nome fica como texto normal; a seta ↗ é o único elemento clicável,
   para uniformizar com o padrão da ByCourseView e evitar conflitos com
   handlers de clique na linha/botão pai. */
export function CourseLink({ name }: { name: string }) {
  const key = findCourseKey(name);
  if (!key) return <>{name}</>;
  return (
    <>
      {name}
      <a href={`/campos/${key}`} className="courseLink fs-10 ml-4" title={`Ver campo: ${name}`}
         target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
        ↗
      </a>
    </>
  );
}
