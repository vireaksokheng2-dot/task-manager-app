<?php

namespace App\Http\Requests;

use App\Models\Label;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class LabelRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';
        $ignoreId = $this->route('label');

        return [
            'name' => [
                $required, 'bail', 'string', 'min:1', 'max:40',
                // Unique per user, ignoring case (matches the DB's lower(name) unique index).
                function (string $attribute, mixed $value, Closure $fail) use ($ignoreId) {
                    $taken = Label::where('user_id', $this->user()->id)
                        ->whereRaw('lower(name) = ?', [mb_strtolower((string) $value)])
                        ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
                        ->exists();

                    if ($taken) {
                        $fail('You already have a label with that name.');
                    }
                },
            ],
            'color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
