import React, { useMemo, useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function NotesGraph({ notes, onNodeClick }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const graphData = useMemo(() => {
    const nodes = [];
    const edges = [];
    const classGroups = {};

    const tagHubs = {};

    notes.forEach(note => {
      nodes.push({
        id: note.id,
        name: note.title || "Untitled",
        group: note.class_summary || "Uncategorized",
        val: 1,
      });

      if (note.class_summary) {
        if (!classGroups[note.class_summary]) classGroups[note.class_summary] = [];
        classGroups[note.class_summary].push(note.id);
      }

      // Parse HTML content for tags and links
      if (note.content) {
        // Find tags: data-type="tagMention" data-id="tagname"
        const tagRegex = /data-type="tagMention"[^>]*data-id="([^"]+)"/g;
        let match;
        while ((match = tagRegex.exec(note.content)) !== null) {
          const tag = match[1];
          if (!tagHubs[tag]) tagHubs[tag] = [];
          tagHubs[tag].push(note.id);
        }

        // Find links: data-type="linkMention" data-id="note:123"
        const linkRegex = /data-type="linkMention"[^>]*data-id="note:([^"]+)"/g;
        while ((match = linkRegex.exec(note.content)) !== null) {
          const targetId = parseInt(match[1]);
          if (!isNaN(targetId)) {
            edges.push({
              source: note.id,
              target: targetId,
              isDirectLink: true
            });
          }
        }
      }
    });

    Object.keys(classGroups).forEach(className => {
      const hubId = `hub_${className}`;
      nodes.push({
        id: hubId,
        name: className,
        group: className,
        val: 2, 
        isHub: true,
      });
      
      classGroups[className].forEach(noteId => {
        edges.push({
          source: noteId,
          target: hubId,
        });
      });
    });

    Object.keys(tagHubs).forEach(tag => {
      const hubId = `tag_${tag}`;
      nodes.push({
        id: hubId,
        name: `#${tag}`,
        group: 'tags',
        val: 1.5,
        isTagHub: true,
      });
      
      tagHubs[tag].forEach(noteId => {
        edges.push({
          source: noteId,
          target: hubId,
        });
      });
    });

    return { nodes, links: edges };
  }, [notes]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: 'var(--surface-muted)' }}>
      {dimensions.width > 0 && (
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeAutoColorBy="group"
          nodeRelSize={6}
          onNodeClick={(node) => {
            if (!node.isHub && !node.isTagHub) {
              onNodeClick(node.id);
            }
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const isSpecial = node.isHub || node.isTagHub;
            const fontSize = isSpecial ? 13 / globalScale : 10 / globalScale;
            ctx.font = `${isSpecial ? 'bold ' : ''}${fontSize}px Sans-Serif`;
            
            // Draw circle
            const r = isSpecial ? 7 : 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            
            if (node.isTagHub) {
              ctx.fillStyle = '#0a84ff'; // Blue for tags
            } else if (node.isHub) {
              ctx.fillStyle = '#ff9f0a'; // Orange for classes
            } else {
              ctx.fillStyle = node.color || '#98989d'; // Gray for standard notes
            }
            ctx.fill();

            // Label
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'var(--text-h)';
            ctx.shadowColor = 'var(--surface-muted)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillText(label, node.x, node.y + r + 3);
            ctx.shadowBlur = 0; // reset
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            const r = (node.isHub || node.isTagHub) ? 7 : 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkColor={(link) => link.isDirectLink ? 'var(--blue)' : 'var(--border-strong)'}
          linkWidth={(link) => link.isDirectLink ? 2 : 1}
          linkLineDash={(link) => link.isDirectLink ? [4, 4] : null}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  );
}
