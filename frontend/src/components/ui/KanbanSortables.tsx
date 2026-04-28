import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KanbanColumn, KanbanItem } from './KanbanBoard'

interface SortableColumnProps {
  column: KanbanColumn
  children: React.ReactNode
}

export function SortableColumn({ column, children }: SortableColumnProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'Column', column },
  })

  // We are not allowing dragging columns yet to keep UX simple, 
  // but it's set up if needed.

  return (
    <div
      ref={setNodeRef}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
      className={`bg-slate-100 rounded-xl flex flex-col w-80 flex-shrink-0 ${isDragging ? 'opacity-40' : ''}`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="px-4 py-3 pb-2 font-semibold text-slate-700 flex items-center justify-between cursor-grab"
      >
        <span>{column.title}</span>
        {/* Placeholder count could go here */}
      </div>
      <div className="flex-1 p-2 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

interface SortableCardProps {
  item: KanbanItem
  children: React.ReactNode
}

export function SortableCard({ item, children }: SortableCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'Task', item },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
      className={`touch-none ${isDragging ? 'opacity-30' : ''}`}
    >
      {children}
    </div>
  )
}
