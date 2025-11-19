import React from "react"

type Props = React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button(props: Props) {
  return (
    <button
      {...props}
      style={{
        padding: 8,
        borderRadius: 6,
        border: "1px solid #ccc",
        background: "#111",
        color: "#fff"
      }}
    />
  )
}