/*
  # Remover tabela de recibos

  1. Changes
    - Drop receipts table and related policies/constraints
*/

DROP TABLE IF EXISTS receipts CASCADE;
