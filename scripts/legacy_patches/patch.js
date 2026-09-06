const fs = require('fs');
const file = 'frontend/src/components/CanvasView.jsx';
let content = fs.readFileSync(file, 'utf8');

const target = `                      <div className="module-card-content">
                        <strong>{course.course_code}</strong>
                        <small>{course.name}</small>
                      </div>
                    </button>`;

const replacement = `                      <div className="module-card-content">
                        <strong>{course.course_code}</strong>
                        <small>{course.name}</small>
                      </div>
                      <div className="module-card-stats" style={{ display: 'flex', gap: '16px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                        <span className="module-card-stat" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <BookOpen size={12} /> {assignments.filter(a => String(a.course_id) === String(course.id) && a.due_at && new Date(a.due_at) >= new Date() && !a.has_submitted).length} upcoming assignment{assignments.filter(a => String(a.course_id) === String(course.id) && a.due_at && new Date(a.due_at) >= new Date() && !a.has_submitted).length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
