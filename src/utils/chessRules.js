// Utilidades para reglas básicas del ajedrez
// Esta es una implementación simplificada para el MVP

// Notación de piezas:
// Mayúsculas = blancas, Minúsculas = negras
// R/r: Torre, N/n: Caballo, B/b: Alfil, Q/q: Reina, K/k: Rey, P/p: Peón

export const PIECE_TYPES = {
  KING: 'k',
  QUEEN: 'q',
  ROOK: 'r',
  BISHOP: 'b',
  KNIGHT: 'n',
  PAWN: 'p'
}

export const COLORS = {
  WHITE: 'white',
  BLACK: 'black'
}

// Convertir pieza a color
export function getPieceColor(piece) {
  if (!piece) return null
  return piece === piece.toUpperCase() ? COLORS.WHITE : COLORS.BLACK
}

// Convertir pieza a tipo
export function getPieceType(piece) {
  if (!piece) return null
  return piece.toLowerCase()
}

// Verificar si una pieza es del color especificado
export function isPieceColor(piece, color) {
  if (!piece) return false
  return getPieceColor(piece) === color
}

// Obtener movimientos válidos básicos para una pieza
export function getValidMoves(board, row, col, piece) {
  if (!piece) return []
  
  const pieceType = getPieceType(piece)
  const pieceColor = getPieceColor(piece)
  
  switch (pieceType) {
    case PIECE_TYPES.PAWN:
      return getPawnMoves(board, row, col, pieceColor)
    case PIECE_TYPES.KNIGHT:
      return getKnightMoves(board, row, col, pieceColor)
    case PIECE_TYPES.BISHOP:
      return getBishopMoves(board, row, col, pieceColor)
    case PIECE_TYPES.ROOK:
      return getRookMoves(board, row, col, pieceColor)
    case PIECE_TYPES.QUEEN:
      return getQueenMoves(board, row, col, pieceColor)
    case PIECE_TYPES.KING:
      return getKingMoves(board, row, col, pieceColor)
    default:
      return []
  }
}

// Movimientos del peón
function getPawnMoves(board, row, col, color) {
  const moves = []
  const direction = color === COLORS.WHITE ? -1 : 1 // Blancas suben, negras bajan
  const startRow = color === COLORS.WHITE ? 6 : 1
  
  // Movimiento hacia adelante (una casilla)
  const forwardRow = row + direction
  if (isValidPosition(forwardRow, col) && !board[forwardRow][col]) {
    moves.push({ row: forwardRow, col })
    
    // Movimiento doble desde posición inicial
    if (row === startRow) {
      const doubleRow = row + (direction * 2)
      if (isValidPosition(doubleRow, col) && !board[doubleRow][col] && !board[forwardRow][col]) {
        moves.push({ row: doubleRow, col })
      }
    }
  }
  
  // Capturas diagonales
  for (const dc of [-1, 1]) {
    const captureCol = col + dc
    const captureRow = row + direction
    
    if (isValidPosition(captureRow, captureCol)) {
      const targetPiece = board[captureRow][captureCol]
      if (targetPiece && getPieceColor(targetPiece) !== color) {
        moves.push({ row: captureRow, col: captureCol })
      }
    }
  }
  
  // TODO: Implementar captura al paso
  
  return moves
}

// Movimientos del caballo (en L)
function getKnightMoves(board, row, col, color) {
  const moves = []
  const knightMoves = [
    { dr: -2, dc: -1 }, { dr: -2, dc: 1 },
    { dr: -1, dc: -2 }, { dr: -1, dc: 2 },
    { dr: 1, dc: -2 }, { dr: 1, dc: 2 },
    { dr: 2, dc: -1 }, { dr: 2, dc: 1 }
  ]
  
  for (const move of knightMoves) {
    const newRow = row + move.dr
    const newCol = col + move.dc
    
    if (isValidPosition(newRow, newCol)) {
      const targetPiece = board[newRow][newCol]
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: newRow, col: newCol })
      }
    }
  }
  
  return moves
}

// Movimientos del alfil (diagonales)
function getBishopMoves(board, row, col, color) {
  const moves = []
  const directions = [
    { dr: -1, dc: -1 }, // Arriba-izquierda
    { dr: -1, dc: 1 },  // Arriba-derecha
    { dr: 1, dc: -1 },  // Abajo-izquierda
    { dr: 1, dc: 1 }    // Abajo-derecha
  ]
  
  for (const dir of directions) {
    let currentRow = row + dir.dr
    let currentCol = col + dir.dc
    
    while (isValidPosition(currentRow, currentCol)) {
      const targetPiece = board[currentRow][currentCol]
      
      if (!targetPiece) {
        // Casilla vacía
        moves.push({ row: currentRow, col: currentCol })
      } else {
        // Pieza en la casilla
        if (getPieceColor(targetPiece) !== color) {
          moves.push({ row: currentRow, col: currentCol })
        }
        break // No podemos saltar sobre piezas
      }
      
      currentRow += dir.dr
      currentCol += dir.dc
    }
  }
  
  return moves
}

// Movimientos de la torre (horizontal/vertical)
function getRookMoves(board, row, col, color) {
  const moves = []
  const directions = [
    { dr: -1, dc: 0 }, // Arriba
    { dr: 1, dc: 0 },  // Abajo
    { dr: 0, dc: -1 }, // Izquierda
    { dr: 0, dc: 1 }   // Derecha
  ]
  
  for (const dir of directions) {
    let currentRow = row + dir.dr
    let currentCol = col + dir.dc
    
    while (isValidPosition(currentRow, currentCol)) {
      const targetPiece = board[currentRow][currentCol]
      
      if (!targetPiece) {
        moves.push({ row: currentRow, col: currentCol })
      } else {
        if (getPieceColor(targetPiece) !== color) {
          moves.push({ row: currentRow, col: currentCol })
        }
        break
      }
      
      currentRow += dir.dr
      currentCol += dir.dc
    }
  }
  
  return moves
}

// Movimientos de la reina (combinación de alfil y torre)
function getQueenMoves(board, row, col, color) {
  const bishopMoves = getBishopMoves(board, row, col, color)
  const rookMoves = getRookMoves(board, row, col, color)
  return [...bishopMoves, ...rookMoves]
}

// Movimientos del rey (una casilla en cualquier dirección)
function getKingMoves(board, row, col, color) {
  const moves = []
  const kingMoves = [
    { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
    { dr: 0, dc: -1 },                     { dr: 0, dc: 1 },
    { dr: 1, dc: -1 },  { dr: 1, dc: 0 },  { dr: 1, dc: 1 }
  ]
  
  for (const move of kingMoves) {
    const newRow = row + move.dr
    const newCol = col + move.dc
    
    if (isValidPosition(newRow, newCol)) {
      const targetPiece = board[newRow][newCol]
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: newRow, col: newCol })
      }
    }
  }
  
  // TODO: Implementar enroque
  
  return moves
}

// Verificar si una posición está dentro del tablero
function isValidPosition(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

// Verificar si un movimiento es válido
export function isValidMove(board, fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol]
  if (!piece) return false
  
  const validMoves = getValidMoves(board, fromRow, fromCol, piece)
  return validMoves.some(move => move.row === toRow && move.col === toCol)
}

// Aplicar un movimiento al tablero
export function applyMove(board, fromRow, fromCol, toRow, toCol) {
  const newBoard = board.map(row => [...row])
  const piece = newBoard[fromRow][fromCol]
  
  if (!piece) return board
  
  // Mover la pieza
  newBoard[toRow][toCol] = piece
  newBoard[fromRow][fromCol] = ''
  
  // TODO: Implementar promoción de peón
  // TODO: Implementar enroque
  // TODO: Implementar captura al paso
  
  return newBoard
}

// Verificar si el rey está en jaque
export function isKingInCheck(board, color) {
  // Encontrar la posición del rey
  let kingRow = -1
  let kingCol = -1
  const kingPiece = color === COLORS.WHITE ? 'K' : 'k'
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === kingPiece) {
        kingRow = row
        kingCol = col
        break
      }
    }
    if (kingRow !== -1) break
  }
  
  if (kingRow === -1) return false // Rey no encontrado (no debería pasar)
  
  // Verificar si alguna pieza del oponente puede capturar al rey
  const opponentColor = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && getPieceColor(piece) === opponentColor) {
        const moves = getValidMoves(board, row, col, piece)
        if (moves.some(move => move.row === kingRow && move.col === kingCol)) {
          return true
        }
      }
    }
  }
  
  return false
}

// Verificar si el rey está en jaque mate
export function isCheckmate(board, color) {
  // Primero verificar si el rey está en jaque
  if (!isKingInCheck(board, color)) {
    return false
  }
  
  // Buscar algún movimiento legal que saque al rey del jaque
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = board[fromRow][fromCol]
      if (piece && getPieceColor(piece) === color) {
        const validMoves = getValidMoves(board, fromRow, fromCol, piece)
        
        for (const move of validMoves) {
          // Aplicar movimiento temporalmente
          const newBoard = applyMove(board, fromRow, fromCol, move.row, move.col)
          
          // Verificar si el rey sigue en jaque
          if (!isKingInCheck(newBoard, color)) {
            return false // Hay al menos un movimiento que evita el jaque
          }
        }
      }
    }
  }
  
  // No hay movimientos legales que eviten el jaque
  return true
}

// Verificar tablas (stalemate)
export function isStalemate(board, color) {
  // Verificar si el rey NO está en jaque
  if (isKingInCheck(board, color)) {
    return false
  }
  
  // Verificar si hay algún movimiento legal
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = board[fromRow][fromCol]
      if (piece && getPieceColor(piece) === color) {
        const validMoves = getValidMoves(board, fromRow, fromCol, piece)
        if (validMoves.length > 0) {
          return false // Hay al menos un movimiento legal
        }
      }
    }
  }
  
  // No hay movimientos legales y el rey no está en jaque
  return true
}

// Crear tablero inicial
export function createInitialBoard() {
  return [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // fila 8 (negras)
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // fila 7
    ['', '', '', '', '', '', '', ''], // fila 6
    ['', '', '', '', '', '', '', ''], // fila 5
    ['', '', '', '', '', '', '', ''], // fila 4
    ['', '', '', '', '', '', '', ''], // fila 3
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // fila 2 (blancas)
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // fila 1
  ]
}

// Convertir notación algebraica a coordenadas
export function algebraicToCoordinates(algebraic) {
  if (algebraic.length < 2) return null
  
  const file = algebraic[0].toLowerCase()
  const rank = parseInt(algebraic[1])
  
  if (!file || !rank || rank < 1 || rank > 8) return null
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const fileIndex = files.indexOf(file)
  
  if (fileIndex === -1) return null
  
  // Convertir rank a índice de fila (rank 8 = fila 0, rank 1 = fila 7)
  const row = 8 - rank
  const col = fileIndex
  
  return { row, col }
}

// Convertir coordenadas a notación algebraica
export function coordinatesToAlgebraic(row, col) {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const rank = 8 - row
  
  if (row < 0 || row > 7 || col < 0 || col > 7) return null
  
  return files[col] + rank
}