<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LabelRequest;
use App\Http\Resources\LabelResource;
use App\Models\Label;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class LabelController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return LabelResource::collection(
            $request->user()->labels()->withCount('tasks')->orderBy('name')->get()
        );
    }

    public function store(LabelRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['color'] ??= Label::PALETTE[$request->user()->labels()->count() % count(Label::PALETTE)];

        $label = $request->user()->labels()->create($data);

        return (new LabelResource($label->loadCount('tasks')))->response()->setStatusCode(201);
    }

    public function update(LabelRequest $request, int $label): LabelResource
    {
        $model = $request->user()->labels()->findOrFail($label);
        $model->update($request->validated());

        return new LabelResource($model->loadCount('tasks'));
    }

    public function destroy(Request $request, int $label): JsonResponse
    {
        $request->user()->labels()->findOrFail($label)->delete();

        return response()->json(null, 204);
    }
}
